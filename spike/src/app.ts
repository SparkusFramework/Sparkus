import { compileRoutes, type CompiledRoute } from "./compile.js";
import { Container, type Token } from "./di.js";
import { SparkusError } from "./errors.js";
import type { RunningServer, Serve } from "./engines/shared.js";

export type Engine = "auto" | "bun" | "node";

export interface AppOptions {
    controllers: Token<object>[];
    /** HTTP engine. "auto" uses Bun.serve under Bun and node:http under Node. */
    engine?: Engine;
}

export interface ListenOptions {
    port?: number;
    hostname?: string;
}

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

function resolveEngine(engine: Engine): "bun" | "node" {
    if (engine === "auto") return isBun ? "bun" : "node";
    if (engine === "bun" && !isBun) {
        throw new SparkusError("SPK1007", 'engine "bun" requires running under Bun. Use engine "auto" or "node".');
    }
    return engine;
}

export function createApp(options: AppOptions) {
    const container = new Container();

    return {
        container,

        /** Resolves the controllers and compiles every route. Overrides must be set before. */
        compile(): CompiledRoute[] {
            return compileRoutes(options.controllers, container);
        },

        async listen({ port = 3000, hostname = "0.0.0.0" }: ListenOptions = {}): Promise<RunningServer> {
            const engine = resolveEngine(options.engine ?? "auto");
            const routes = this.compile();
            const { serve }: { serve: Serve } =
                engine === "bun" ? await import("./engines/bun.js") : await import("./engines/node.js");
            return serve(routes, { port, hostname });
        },
    };
}
