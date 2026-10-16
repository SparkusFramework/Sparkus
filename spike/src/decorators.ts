import type { Infer, Schema } from "./schema.js";
import { SparkusError } from "./errors.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteOptions {
    /** Schema of the JSON body. The body is parsed and validated before the handler runs. */
    body?: Schema;
    /** Status of a successful response. Defaults to 200. */
    status?: number;
}

export interface RouteMeta {
    method: HttpMethod;
    path: string;
    options: RouteOptions;
    name: string;
}

export interface ControllerMeta {
    prefix: string;
}

/**
 * Request context received by every handler. `body` is typed from the route's
 * schema: `ctx: Ctx<typeof MyRoute>`.
 */
export interface Ctx<O extends RouteOptions = RouteOptions> {
    readonly params: Record<string, string>;
    readonly query: Record<string, string | undefined>;
    readonly body: O["body"] extends Schema ? Infer<O["body"]> : undefined;
    header(name: string): string | undefined;
}

export const ROUTE = Symbol.for("sparkus.route");
export const CONTROLLER = Symbol.for("sparkus.controller");

export function Controller(prefix = "") {
    return function (value: Function, _context: ClassDecoratorContext): void {
        (value as any)[CONTROLLER] = { prefix } satisfies ControllerMeta;
    };
}

function route(method: HttpMethod) {
    return function <O extends RouteOptions = {}>(path = "", options?: O) {
        return function <This>(
            value: (this: This, ctx: Ctx<O>) => unknown,
            context: ClassMethodDecoratorContext<This>,
        ): void {
            if (context.static || context.private) {
                throw new SparkusError(
                    "SPK1005",
                    `@${method[0]}${method.slice(1).toLowerCase()}() on "${String(context.name)}": ` +
                        "route handlers must be public instance methods.",
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
