import { ErrorCode, SparkusApp, SparkusError, type AppOptions as CoreAppOptions } from "@sparkus/core";
import { callerFile, type Engine } from "@sparkus/core/engine";

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
 * Creates an application. Controllers are found in the source folder of the file calling
 * this (every `*.controller.ts` under `src/`), unless `controllers` lists them. The HTTP
 * engine is loaded on listen(), so an app that is only tested in memory never loads a server.
 *
 *     const app = createApp();
 *     await app.listen({ port: 3000 });
 */
export function createApp(options: AppOptions = {}): SparkusApp {
    const choice = options.engine ?? "auto";
    const origin = typeof options.controllers === "object" ? undefined : callerFile(createApp);
    return new SparkusApp({ ...options, engine: () => loadEngine(choice) }, origin);
}
