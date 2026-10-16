import type { Ctx, RequestContext } from "./context.js";
import type { Class, Container } from "./di.js";
import { ErrorCode, HttpError, SparkusError, guardRejected } from "./errors.js";
import type { Issue, Validator } from "./schema.js";

/** A guard lets a request through by returning `true`. Anything else answers 403. */
export type GuardFn = (ctx: Ctx<any>) => boolean | Promise<boolean>;

/** Class form of a guard: Sparkus constructs it once, so it can `inject()` services. */
export interface Guard {
    canActivate(ctx: Ctx<any>): boolean | Promise<boolean>;
}

export type GuardLike = GuardFn | Class<Guard>;

/** Runs the rest of the pipeline (inner interceptors, body validation, handler) and returns its result. */
export type Next = () => unknown;

/** An interceptor wraps the handler: it calls `next()` and may transform the result or catch errors. */
export type InterceptorFn = (ctx: Ctx<any>, next: Next) => unknown;

/** Class form of an interceptor: Sparkus constructs it once, so it can `inject()` services. */
export interface Interceptor {
    intercept(ctx: Ctx<any>, next: Next): unknown;
}

export type InterceptorLike = InterceptorFn | Class<Interceptor>;

export type Run = (ctx: RequestContext) => unknown;

function describe(item: unknown): string {
    return typeof item === "function" ? item.name || "<anonymous function>" : String(item);
}

function isClass(fn: Function): boolean {
    return /^class[\s{]/.test(Function.prototype.toString.call(fn));
}

export function resolveGuard(item: GuardLike, container: Container, where: string): GuardFn {
    if (typeof item === "function") {
        const proto = (item as { prototype?: Partial<Guard> }).prototype;
        if (proto !== undefined && typeof proto.canActivate === "function") {
            const guard = container.get(item as Class<Guard>);
            return guard.canActivate.bind(guard);
        }
        if (!isClass(item)) return item as GuardFn;
    }
    throw new SparkusError(
        ErrorCode.InvalidPipelineItem,
        `Guard ${describe(item)} on ${where} is neither a function (ctx) => boolean nor a class with canActivate(ctx).`,
    );
}

export function resolveInterceptor(item: InterceptorLike, container: Container, where: string): InterceptorFn {
    if (typeof item === "function") {
        const proto = (item as { prototype?: Partial<Interceptor> }).prototype;
        if (proto !== undefined && typeof proto.intercept === "function") {
            const interceptor = container.get(item as Class<Interceptor>);
            return interceptor.intercept.bind(interceptor);
        }
        if (!isClass(item)) return item as InterceptorFn;
    }
    throw new SparkusError(
        ErrorCode.InvalidPipelineItem,
        `Interceptor ${describe(item)} on ${where} is neither a function (ctx, next) => unknown nor a class with intercept(ctx, next).`,
    );
}

export function validationFailed(issue: Issue): HttpError {
    return new HttpError(400, `Request body is invalid: ${issue.path} ${issue.message}.`, {
        code: ErrorCode.ValidationFailed,
        extensions: { issues: [issue] },
    });
}

function runGuards(guards: readonly GuardFn[], from: number, ctx: RequestContext, next: Run): unknown {
    for (let i = from; i < guards.length; i++) {
        const verdict = guards[i]!(ctx);
        if (verdict === true) continue;
        if (verdict instanceof Promise) {
            return verdict.then((resolved) => {
                if (resolved !== true) throw guardRejected();
                return runGuards(guards, i + 1, ctx, next);
            });
        }
        throw guardRejected();
    }
    return next(ctx);
}

export interface PipelineParts {
    handler: Run;
    guards: readonly GuardFn[];
    interceptors: readonly InterceptorFn[];
    /** Read the JSON body before validation. */
    readBody: boolean;
    validate: Validator | null;
    bodyLimit: number;
}

/**
 * Builds the function that runs a route, from the inside out:
 * guards -> interceptors -> body reading -> validation -> handler.
 *
 * Each stage exists only when the route needs it: a route without guards,
 * interceptors or body is its bound handler, nothing more. The result is
 * returned as is, or as a promise only when a stage is asynchronous.
 */
export function composePipeline(parts: PipelineParts): Run {
    let run = parts.handler;

    if (parts.validate !== null) {
        const validate = parts.validate;
        const handler = run;
        run = (ctx) => {
            const issue = validate(ctx.body);
            if (issue !== null) throw validationFailed(issue);
            return handler(ctx);
        };
    }

    if (parts.readBody) {
        const next = run;
        const limit = parts.bodyLimit;
        run = (ctx) =>
            ctx.readBody(limit).then((body) => {
                ctx.body = body;
                return next(ctx);
            });
    }

    for (let i = parts.interceptors.length - 1; i >= 0; i--) {
        const intercept = parts.interceptors[i]!;
        const next = run;
        run = (ctx) => intercept(ctx, () => next(ctx));
    }

    if (parts.guards.length > 0) {
        const guards = parts.guards;
        const next = run;
        run = guards.length === 1 ? singleGuard(guards[0]!, next) : (ctx) => runGuards(guards, 0, ctx, next);
    }

    return run;
}

function singleGuard(guard: GuardFn, next: Run): Run {
    return (ctx) => {
        const verdict = guard(ctx);
        if (verdict === true) return next(ctx);
        if (verdict instanceof Promise) {
            return verdict.then((resolved) => {
                if (resolved !== true) throw guardRejected();
                return next(ctx);
            });
        }
        throw guardRejected();
    };
}
