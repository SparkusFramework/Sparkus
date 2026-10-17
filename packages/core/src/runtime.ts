import type { CompiledRoute } from "./compile.js";
import type { Ctx, RequestContext } from "./context.js";
import {
    HttpError,
    SparkusError,
    renderHttpError,
    renderInternalError,
    renderMethodNotAllowed,
    renderRouteNotFound,
    type RenderedError,
} from "./errors.js";
import type { Logger } from "./log.js";
import type { Observer } from "./observe.js";
import { suggestRoute } from "./suggest.js";

/**
 * Maps an error before Sparkus renders it. Return an HttpError (or any error)
 * to replace it, or nothing to keep the default rendering.
 *
 *     onError: (error) => (error instanceof UniqueViolation ? HttpError.conflict(error.message) : undefined)
 */
export type ErrorMapper = (error: unknown, ctx: Ctx<any>) => unknown;

export interface RuntimeOptions {
    /** Largest body limit of any route: engines bound what they buffer with it. */
    bodyLimit: number;
    exposeErrors: boolean;
    onError: ErrorMapper | undefined;
    log: Logger;
    /** Lowercase name of the header the request id is read from. */
    requestIdHeader: string;
    observer: Observer | null;
}

/** A request id taken from a client must be safe to log and to echo. */
const SAFE_ID = /^[\w.:-]{1,128}$/;

/**
 * Everything an engine needs from the app: compiled routes, the error
 * rendering rules and the request observer. Built once by `app.init()`.
 */
export class AppRuntime {
    readonly bodyLimit: number;
    readonly log: Logger;
    readonly requestIdHeader: string;
    /** Null when the app observes nothing: engines then keep their plain request path. */
    readonly observer: Observer | null;
    /** True from the start of a shutdown: readiness fails so load balancers stop sending traffic. */
    draining = false;
    private readonly errors: Logger;

    constructor(
        readonly routes: readonly CompiledRoute[],
        private readonly options: RuntimeOptions,
    ) {
        this.bodyLimit = options.bodyLimit;
        this.log = options.log;
        this.requestIdHeader = options.requestIdHeader;
        this.observer = options.observer;
        this.errors = options.log.child("sparkus");
    }

    /** The client's request id when it is safe, else a new one. */
    requestId(incoming: string | null | undefined): string {
        return incoming != null && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
    }

    /**
     * Turns anything thrown by a guard, interceptor or handler into a
     * problem+json response. HttpErrors are sent as declared. Any other error
     * is logged and answers 500; its message is sent only when `exposeErrors`
     * is on, and the stack never is.
     */
    renderError(error: unknown, ctx?: Ctx<any>): RenderedError {
        let current = error;
        const { onError } = this.options;
        if (onError !== undefined && ctx !== undefined) {
            try {
                const mapped = onError(error, ctx);
                if (mapped !== undefined) current = mapped;
            } catch (thrown) {
                current = thrown;
            }
        }

        if (current instanceof HttpError) {
            if (current.status >= 500) this.report(current, ctx);
            return renderHttpError(current);
        }

        this.report(current, ctx);
        const detail = this.options.exposeErrors
            ? current instanceof Error
                ? current.message
                : String(current)
            : undefined;
        return renderInternalError(detail, current instanceof SparkusError ? current.code : undefined);
    }

    notFound(method: string, path: string): RenderedError {
        const suggestion = this.options.exposeErrors ? suggestRoute(this.routes, method, path) : undefined;
        return renderRouteNotFound(method, path, suggestion);
    }

    methodNotAllowed(method: string, path: string, allow: string): RenderedError {
        return renderMethodNotAllowed(method, path, allow);
    }

    private report(error: unknown, ctx: Ctx<any> | undefined): void {
        if (ctx === undefined) {
            this.errors.error("Unhandled error", { err: error });
            return;
        }
        this.errors.error(`Unhandled error in ${ctx.method} ${ctx.path}`, { err: error, reqId: ctx.requestId });
        (ctx as RequestContext).span?.recordException(error);
    }
}
