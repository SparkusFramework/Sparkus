import type { Ctx, HandlerResult, HttpMethod, RouteOptions } from "./context.js";
import { ErrorCode, SparkusError } from "./errors.js";
import type { GuardLike, InterceptorLike } from "./pipeline.js";

export interface RouteMeta {
    method: HttpMethod;
    path: string;
    options: RouteOptions;
    name: string;
}

export interface ControllerMeta {
    prefix: string;
}

// Symbol.for, so two copies of @sparkus/core in one process still agree.
export const ROUTE = Symbol.for("sparkus.route");
export const CONTROLLER = Symbol.for("sparkus.controller");
export const GUARDS = Symbol.for("sparkus.guards");
export const INTERCEPTORS = Symbol.for("sparkus.interceptors");

/** Marks a class as a controller. Every route path is prefixed with `prefix`. */
export function Controller(prefix = "") {
    return function (value: Function, _context: ClassDecoratorContext): void {
        (value as any)[CONTROLLER] = { prefix } satisfies ControllerMeta;
    };
}

function route(method: HttpMethod) {
    const decorator = `@${method[0]}${method.slice(1).toLowerCase()}()`;
    return function <O extends RouteOptions = {}>(path = "", options?: O) {
        return function <This>(
            value: (this: This, ctx: Ctx<O>) => HandlerResult<O>,
            context: ClassMethodDecoratorContext<This>,
        ): void {
            if (context.static || context.private) {
                throw new SparkusError(
                    ErrorCode.InvalidHandler,
                    `${decorator} on ${context.static ? "static" : "private"} method ${String(context.name)}: route handlers must be public instance methods.`,
                );
            }
            (value as any)[ROUTE] = {
                method,
                path,
                options: options ?? {},
                name: String(context.name),
            } satisfies RouteMeta;
        };
    };
}

export const Get = route("GET");
export const Post = route("POST");
export const Put = route("PUT");
export const Patch = route("PATCH");
export const Delete = route("DELETE");
export const Head = route("HEAD");
export const Options = route("OPTIONS");

function prepend(target: any, key: symbol, items: readonly unknown[]): void {
    // Decorators apply bottom-up: prepending keeps the order in which they are written.
    target[key] = Object.hasOwn(target, key) ? [...items, ...target[key]] : [...items];
}

/**
 * Runs guards before the handler, in order: app guards, then controller
 * guards, then route guards. A guard returns `true` to let the request
 * through; anything else answers 403. A guard may also throw an HttpError.
 *
 *     @UseGuards(AuthGuard)
 */
export function UseGuards(...guards: GuardLike[]) {
    return function (value: Function, _context: ClassDecoratorContext | ClassMethodDecoratorContext): void {
        prepend(value, GUARDS, guards);
    };
}

/**
 * Wraps the handler with interceptors, outermost first: app, controller, route.
 * An interceptor calls `next()` to run the rest of the pipeline and may
 * transform its result or catch its errors.
 *
 *     @UseInterceptors(TimingInterceptor)
 */
export function UseInterceptors(...interceptors: InterceptorLike[]) {
    return function (value: Function, _context: ClassDecoratorContext | ClassMethodDecoratorContext): void {
        prepend(value, INTERCEPTORS, interceptors);
    };
}
