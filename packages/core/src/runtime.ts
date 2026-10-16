import type { CompiledRoute } from "./compile.js";
import type { Ctx } from "./context.js";
import {
    HttpError,
    methodNotAllowed,
    renderHttpError,
    renderInternalError,
    routeNotFound,
    type RenderedError,
} from "./errors.js";

/**
 * Maps an error before Sparkus renders it. Return an HttpError (or any error)
 * to replace it, or nothing to keep the default rendering.
 *
 *     onError: (error) => (error instanceof UniqueViolation ? HttpError.conflict(error.message) : undefined)
 */
export type ErrorMapper = (error: unknown, ctx: Ctx<any>) => unknown;

export interface Logger {
    error(message: string, error?: unknown): void;
}

export interface RuntimeOptions {
    bodyLimit: number;
    exposeErrors: boolean;
    onError: ErrorMapper | undefined;
    logger: Logger;
}

/**
 * Everything an engine needs from the app: compiled routes and the error
 * rendering rules. Built once by `app.init()`.
 */
export class AppRuntime {
    readonly bodyLimit: number;

    constructor(
        readonly routes: readonly CompiledRoute[],
        private readonly options: RuntimeOptions,
    ) {
        this.bodyLimit = options.bodyLimit;
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
            if (current.status >= 500) this.log(current, ctx);
            return renderHttpError(current);
        }

        this.log(current, ctx);
        const detail = this.options.exposeErrors
            ? current instanceof Error
                ? current.message
                : String(current)
            : undefined;
        return renderInternalError(detail);
    }

    notFound(method: string, path: string): RenderedError {
        return renderHttpError(routeNotFound(method, path));
    }

    methodNotAllowed(method: string, path: string, allow: string): RenderedError {
        return renderHttpError(methodNotAllowed(method, path, allow));
    }

    private log(error: unknown, ctx: Ctx<any> | undefined): void {
        const where = ctx === undefined ? "" : ` in ${ctx.method} ${ctx.path}`;
        this.options.logger.error(`[sparkus] Unhandled error${where}`, error);
    }
}
