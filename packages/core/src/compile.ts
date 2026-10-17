import type { HttpMethod, RequestContext } from "./context.js";
import {
    CONTROLLER,
    GUARDS,
    INTERCEPTORS,
    ROUTE,
    type ControllerMeta,
    type RouteMeta,
} from "./decorators.js";
import type { Class, Container } from "./di.js";
import { ErrorCode, SparkusError } from "./errors.js";
import {
    composePipeline,
    resolveGuard,
    resolveInterceptor,
    type GuardFn,
    type GuardLike,
    type InterceptorFn,
    type InterceptorLike,
    type Run,
} from "./pipeline.js";
import { compileValidator, type Schema } from "./schema.js";

/**
 * A route resolved at startup: controller bound, guards and interceptors
 * resolved, validator compiled, pipeline composed. Engines only plug `run`
 * into their server.
 */
export interface CompiledRoute {
    readonly method: HttpMethod;
    readonly path: string;
    readonly paramNames: readonly string[];
    readonly status: number;
    /** "UserController.create", for errors and tooling. */
    readonly handlerName: string;
    readonly body: Schema | undefined;
    readonly guards: number;
    readonly interceptors: number;
    /** Runs the whole pipeline. Returns the handler's value, or a promise of it. */
    readonly run: Run;
}

export interface CompileOptions {
    controllers: readonly Class<object>[];
    guards: readonly GuardLike[];
    interceptors: readonly InterceptorLike[];
    bodyLimit: number;
}

const PARAM_NAME = /^[A-Za-z_$][\w$]*$/;

export function joinPath(prefix: string, path: string): string {
    const parts = [prefix, path].map((p) => p.replace(/^\/+|\/+$/g, "")).filter((p) => p.length > 0);
    return "/" + parts.join("/");
}

/** Validates a full route path and returns its parameter names, in order. */
export function parsePath(path: string, where: string): string[] {
    const names: string[] = [];
    if (path === "/") return names;
    for (const segment of path.split("/").slice(1)) {
        const invalid = (reason: string) =>
            new SparkusError(ErrorCode.InvalidRoutePath, `Route path "${path}" (${where}) ${reason}.`);
        if (segment.length === 0) throw invalid("has an empty segment (double slash)");
        if (segment.startsWith(":")) {
            const name = segment.slice(1);
            if (!PARAM_NAME.test(name) || name === "__proto__") {
                throw invalid(`has an invalid parameter name ":${name}" (use letters, digits, _ and $)`);
            }
            if (names.includes(name)) throw invalid(`uses the parameter ":${name}" twice`);
            names.push(name);
        } else if (/[:*?()]/.test(segment)) {
            throw invalid(`has an unsupported segment "${segment}" (only static segments and :params are supported)`);
        }
    }
    return names;
}

function own<T>(target: object, key: symbol): readonly T[] {
    return Object.hasOwn(target, key) ? ((target as any)[key] as T[]) : [];
}

export function compileRoutes(options: CompileOptions, container: Container): CompiledRoute[] {
    const appGuards = options.guards.map((g) => resolveGuard(g, container, "the app"));
    const appInterceptors = options.interceptors.map((i) => resolveInterceptor(i, container, "the app"));

    const routes: CompiledRoute[] = [];
    const declared = new Map<string, string>();

    for (const controller of options.controllers) {
        const meta = Object.hasOwn(controller, CONTROLLER) ? ((controller as any)[CONTROLLER] as ControllerMeta) : undefined;
        if (meta === undefined) {
            throw new SparkusError(
                ErrorCode.MissingController,
                `${controller.name} is in "controllers" but has no @Controller(). ` +
                    "Add it, or remove the class from controllers (services are created by inject()).",
            );
        }

        const instance = container.get(controller);
        const controllerGuards = own<GuardLike>(controller, GUARDS).map((g) => resolveGuard(g, container, controller.name));
        const controllerInterceptors = own<InterceptorLike>(controller, INTERCEPTORS).map((i) =>
            resolveInterceptor(i, container, controller.name),
        );

        for (const key of Object.getOwnPropertyNames(controller.prototype)) {
            if (key === "constructor") continue;
            const method = Object.getOwnPropertyDescriptor(controller.prototype, key)?.value;
            if (typeof method !== "function" || !Object.hasOwn(method, ROUTE)) continue;

            const route = method[ROUTE] as RouteMeta;
            const handlerName = `${controller.name}.${route.name}`;
            const path = joinPath(meta.prefix, route.path);
            const paramNames = parsePath(path, handlerName);

            const id = `${route.method} ${path}`;
            const previous = declared.get(id);
            if (previous !== undefined) {
                throw new SparkusError(ErrorCode.DuplicateRoute, `Route ${id} is declared twice: ${previous} and ${handlerName}.`);
            }
            declared.set(id, handlerName);

            const guards: GuardFn[] = [
                ...appGuards,
                ...controllerGuards,
                ...own<GuardLike>(method, GUARDS).map((g) => resolveGuard(g, container, handlerName)),
            ];
            const interceptors: InterceptorFn[] = [
                ...appInterceptors,
                ...controllerInterceptors,
                ...own<InterceptorLike>(method, INTERCEPTORS).map((i) => resolveInterceptor(i, container, handlerName)),
            ];
            const body = route.options.body;

            routes.push({
                method: route.method,
                path,
                paramNames,
                status: route.options.status ?? 200,
                handlerName,
                body,
                guards: guards.length,
                interceptors: interceptors.length,
                run: composePipeline({
                    handler: method.bind(instance) as (ctx: RequestContext) => unknown,
                    guards,
                    interceptors,
                    readBody: body !== undefined,
                    validate: body === undefined ? null : compileValidator(body),
                    bodyLimit: options.bodyLimit,
                }),
            });
        }
    }

    return routes;
}
