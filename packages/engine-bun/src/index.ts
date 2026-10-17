/// <reference types="bun" />
// Bun globals for projects that type check these sources without "bun" in their types.
import {
    NO_PARAMS,
    createFetchHandler,
    createWebHandler,
    errorResponse,
    type AppRuntime,
    type Engine,
    type EngineServer,
} from "@sparkus/core/engine";

type BunRequest = Request & { params: Record<string, string> };
type BunServer = { timeout(request: Request, seconds: number): void };
type BunRouteHandler = (request: BunRequest, server: BunServer) => Response | Promise<Response>;

export interface BunEngineOptions {
    /** Lets several processes listen on the same port (Linux). Used for zero-downtime restarts. */
    reusePort?: boolean;
    /** Seconds before an idle connection is closed. Bun's default is 10. */
    idleTimeout?: number;
}

const BUN_DEFAULT_IDLE = 10;

/**
 * Bun's idle timeout also runs while a handler works: a request slower than it is cut, where
 * Node waits. A pending handler suspends it for its connection; the response re-arms it, or the
 * connection would never time out again. Synchronous answers never reach this.
 */
function waitForHandler(out: Promise<Response>, request: Request, server: BunServer, idle: number): Promise<Response> {
    server.timeout(request, 0);
    return out.then((response) => {
        server.timeout(request, idle);
        return response;
    });
}

/**
 * HTTP engine on `Bun.serve`. Every route goes to Bun's native router, so
 * matching and parameter extraction happen in Zig, not in JavaScript.
 * Everything the native router does not answer (unknown path, other method,
 * backtracking between routes) falls back to the Sparkus router, so behavior
 * is identical to the Node engine.
 */
export function bunEngine(options: BunEngineOptions = {}): Engine {
    return {
        name: "bun",
        async listen(runtime: AppRuntime, { port, hostname, idleTimeout }): Promise<EngineServer> {
            if (typeof Bun === "undefined") {
                throw new Error('[SPK1007] The "bun" engine needs the Bun runtime. Use nodeEngine() under Node.');
            }
            // Seconds, at most 255 (Bun's limit); the app option is in milliseconds.
            const idle = idleTimeout === undefined ? (options.idleTimeout ?? BUN_DEFAULT_IDLE) : Math.min(255, Math.ceil(idleTimeout / 1000));

            const table: Record<string, Record<string, BunRouteHandler>> = {};
            for (const route of runtime.routes) {
                const handle = createWebHandler(route, runtime);
                const handler: BunRouteHandler =
                    route.paramNames.length === 0
                        ? (request, server) => {
                              const out = handle(request, NO_PARAMS);
                              return out instanceof Promise ? waitForHandler(out, request, server, idle) : out;
                          }
                        : (request, server) => {
                              const out = handle(request, request.params);
                              return out instanceof Promise ? waitForHandler(out, request, server, idle) : out;
                          };
                (table[route.path] ??= {})[route.method] = handler;
            }

            const fallback = createFetchHandler(runtime);
            const server = Bun.serve({
                port,
                hostname,
                reusePort: options.reusePort,
                idleTimeout: idle,
                // Bun answers a bare 413 above this cap, before any handler runs. Sparkus checks
                // bodyLimit itself (problem+json 413); the cap only bounds what Bun buffers.
                maxRequestBodySize: Math.max(runtime.bodyLimit * 2, runtime.bodyLimit + 64 * 1024),
                development: false,
                routes: table as any,
                fetch: (request, server) => waitForHandler(fallback(request), request, server, idle),
                error: (error) => errorResponse(runtime.renderError(error)),
            });

            return {
                port: server.port!,
                hostname: server.hostname ?? hostname,
                stop: (force) => server.stop(force),
            };
        },
    };
}
