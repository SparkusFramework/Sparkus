import { CONTROLLER, ROUTE, type ControllerMeta, type Ctx, type HttpMethod, type RouteMeta } from "./decorators.js";
import { Container, type Token } from "./di.js";
import { SparkusError } from "./errors.js";
import { compileValidator, type Validator } from "./schema.js";

/**
 * A route resolved at startup: the controller instance is bound, the body
 * validator is compiled. Engines only have to plug this into their server.
 */
export interface CompiledRoute {
    method: HttpMethod;
    path: string;
    status: number;
    /** Body validator, or null when the route declares no body. */
    validate: Validator | null;
    invoke: (ctx: Ctx<any>) => unknown;
    /** "UserController.create", for error messages and tooling. */
    handlerName: string;
}

function joinPath(prefix: string, path: string): string {
    const parts = [prefix, path].map((p) => p.replace(/^\/+|\/+$/g, "")).filter((p) => p.length > 0);
    return "/" + parts.join("/");
}

export function compileRoutes(controllers: Token<object>[], container: Container): CompiledRoute[] {
    const routes: CompiledRoute[] = [];
    const declared = new Map<string, string>();

    for (const controller of controllers) {
        const meta: ControllerMeta | undefined = (controller as any)[CONTROLLER];
        if (meta === undefined) {
            throw new SparkusError(
                "SPK1004",
                `${controller.name} is listed in "controllers" but has no @Controller() decorator.`,
            );
        }

        const instance = container.get(controller);

        for (const key of Object.getOwnPropertyNames(controller.prototype)) {
            const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, key);
            if (key === "constructor" || typeof descriptor?.value !== "function") continue;

            const route: RouteMeta | undefined = descriptor.value[ROUTE];
            if (route === undefined) continue;

            const path = joinPath(meta.prefix, route.path);
            const id = `${route.method} ${path}`;
            const handlerName = `${controller.name}.${route.name}`;

            const previous = declared.get(id);
            if (previous !== undefined) {
                throw new SparkusError("SPK1003", `Route ${id} is declared twice: ${previous} and ${handlerName}.`);
            }
            declared.set(id, handlerName);

            routes.push({
                method: route.method,
                path,
                status: route.options.status ?? 200,
                validate: route.options.body ? compileValidator(route.options.body) : null,
                invoke: descriptor.value.bind(instance),
                handlerName,
            });
        }
    }

    return routes;
}
