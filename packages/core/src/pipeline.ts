import type { Ctx, RequestContext } from "./context.js";
import type { Class, Container } from "./di.js";
import { ErrorCode, HttpError, SparkusError, guardRejected, requestTimedOut } from "./errors.js";
import type { Issue } from "./schema.js";

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
    /** Validates the JSON body and keeps its declared fields (route `body` schema). Null: the body is not read. */
    parseBody: Step | null;
    bodyLimit: number;
    /** Reduces the handler's value to its declared fields (route `response` schema). May return a promise. */
    project: Step | null;
    /** Converts and validates path parameters (route `params` schema). */
    coerceParams: Step | null;
    /** Converts and validates query parameters (route `query` schema). */
    coerceQuery: Step | null;
    /**
     * True when a body, params or query step may return a promise (a Standard Schema validates
     * asynchronously). `t` schemas never do, and keep stages without the extra check.
     */
    asyncInput: boolean;
    /** Milliseconds before an unsettled request answers 503 and aborts `ctx.signal`. 0: no limit. */
    timeout: number;
}

/** One schema stage: takes the raw value, returns the checked one (or a promise of it), throws on invalid input. */
export type Step = (value: any) => any;

/**
 * Builds the function that runs a route, from the inside out:
 * guards -> interceptors -> body reading and validation -> handler -> projection.
 *
 * Each stage exists only when the route needs it: a route without guards,
 * interceptors or body is its bound handler, nothing more. The result is
 * returned as is, or as a promise only when a stage is asynchronous.
 */
export function composePipeline(parts: PipelineParts): Run {
    let run = parts.handler;

    // Right after the handler, so interceptors see the value the client will get.
    if (parts.project !== null) {
        const project = parts.project;
        const handler = run;
        run = (ctx) => {
            const out = handler(ctx);
            return out instanceof Promise ? out.then(project) : project(out);
        };
    }

    if (parts.parseBody !== null) {
        const parse = parts.parseBody;
        const next = run;
        const limit = parts.bodyLimit;
        run = parts.asyncInput
            ? (ctx) =>
                  ctx
                      .readBody(limit)
                      .then(parse)
                      .then((body) => {
                          ctx.body = body;
                          return next(ctx);
                      })
            : (ctx) =>
                  ctx.readBody(limit).then((body) => {
                      ctx.body = parse(body);
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

    // Typed params and query come first, so guards and interceptors see converted values.
    const coerceParams = parts.coerceParams;
    const coerceQuery = parts.coerceQuery;
    if (coerceParams !== null || coerceQuery !== null) {
        const next = run;
        if (parts.asyncInput) {
            run = (ctx) => checkInputs(ctx, coerceParams, coerceQuery, next);
        } else if (coerceQuery === null) {
            run = (ctx) => {
                ctx.params = coerceParams!(ctx.params);
                return next(ctx);
            };
        } else if (coerceParams === null) {
            run = (ctx) => {
                ctx.query = coerceQuery(ctx.query);
                return next(ctx);
            };
        } else {
            run = (ctx) => {
                ctx.params = coerceParams(ctx.params);
                ctx.query = coerceQuery(ctx.query);
                return next(ctx);
            };
        }
    }

    // Outermost: the limit covers everything the request waits for, the body included.
    if (parts.timeout > 0) run = withTimeout(run, parts.timeout);

    return run;
}

/** A synchronous result is never late; a promise races a timer that aborts the request. */
function withTimeout(next: Run, ms: number): Run {
    return (ctx) => {
        const out = next(ctx);
        if (!(out instanceof Promise)) return out;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const error = requestTimedOut(ms);
                ctx.abort(error);
                reject(error);
            }, ms);
            out.then(
                (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                (error) => {
                    clearTimeout(timer);
                    reject(error);
                },
            );
        });
    };
}

/** Params then query, waiting for a step only when it returns a promise. */
function checkInputs(ctx: RequestContext, params: Step | null, query: Step | null, next: Run): unknown {
    if (params !== null) {
        const out = params(ctx.params);
        if (out instanceof Promise) {
            return out.then((value) => {
                ctx.params = value;
                return checkInputs(ctx, null, query, next);
            });
        }
        ctx.params = out;
    }
    if (query !== null) {
        const out = query(ctx.query);
        if (out instanceof Promise) {
            return out.then((value) => {
                ctx.query = value;
                return next(ctx);
            });
        }
        ctx.query = out;
    }
    return next(ctx);
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
