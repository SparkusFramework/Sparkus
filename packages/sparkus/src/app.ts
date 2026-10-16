import {
    createApp as createCoreApp,
    ErrorCode,
    SparkusError,
    type AppOptions as CoreAppOptions,
    type Engine,
    type SparkusApp,
} from "@sparkus/core";

/** "auto" picks Bun.serve under Bun and node:http under Node. */
export type EngineChoice = "auto" | "bun" | "node" | Engine;

export interface AppOptions extends Omit<CoreAppOptions, "engine"> {
    /** HTTP engine. Default: "auto". */
    engine?: EngineChoice;
}

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

async function loadEngine(choice: EngineChoice): Promise<Engine> {
    if (typeof choice === "object") return choice;
    const name = choice === "auto" ? (isBun ? "bun" : "node") : choice;
    if (name === "bun") {
        if (!isBun) {
            throw new SparkusError(ErrorCode.NoEngine, 'engine "bun" needs the Bun runtime. Use engine "auto" or "node".');
        }
        return (await import("@sparkus/engine-bun")).bunEngine();
    }
    return (await import("@sparkus/engine-node")).nodeEngine();
}

/**
 * Creates an application. The HTTP engine is loaded on listen(), so an app
 * that is only tested in memory never loads a server.
 *
 *     const app = createApp({ controllers: [UserController] });
 *     await app.listen({ port: 3000 });
 */
export function createApp(options: AppOptions): SparkusApp {
    const choice = options.engine ?? "auto";
    return createCoreApp({ ...options, engine: () => loadEngine(choice) });
}
