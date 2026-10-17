import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** What the CLI needs from a Sparkus app. Duck-typed: the CLI has no dependency on the framework. */
export interface InspectableApp {
    init(): Promise<void>;
    openapi(options?: { title?: string; version?: string }): Record<string, unknown>;
    readonly routes: Array<{
        method: string;
        path: string;
        handler: string;
        status: number;
        body: boolean;
        guards: number;
        interceptors: number;
    }>;
}

/** A usage error: wrong entry, wrong export. Exit code 2. */
export class CliError extends Error {
    override readonly name = "CliError";
}

const DEFAULT_ENTRIES = ["src/app.ts", "app.ts", "src/app.js", "app.js"];

/** Imports the module that exports the app (`export default app` or `export const app`). */
export async function loadApp(entry: string | undefined, cwd: string): Promise<{ app: InspectableApp; entry: string }> {
    const candidates = entry === undefined ? DEFAULT_ENTRIES : [entry];
    const found = candidates.find((candidate) => existsSync(resolve(cwd, candidate)));
    if (found === undefined) {
        throw new CliError(
            entry === undefined
                ? `No app entry found (tried ${DEFAULT_ENTRIES.join(", ")}). Pass the file that exports the app: sparkus check src/app.ts`
                : `${entry} not found.`,
        );
    }
    const module = await import(pathToFileURL(resolve(cwd, found)).href);
    const app = module.default ?? module.app;
    if (app === null || typeof app !== "object" || typeof app.init !== "function") {
        throw new CliError(
            `${found} does not export an app. Add "export default app" (the result of createApp), and call listen() from another file.`,
        );
    }
    return { app, entry: found };
}

// Same symbol as @sparkus/core's @Controller(): the CLI does not import the framework.
const CONTROLLER = Symbol.for("sparkus.controller");
const CONTROLLER_FILE = /\.controller\.[cm]?[jt]s$/;

function controllerFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...controllerFiles(path));
        else if (CONTROLLER_FILE.test(entry.name)) found.push(path);
    }
    return found;
}

/**
 * Controllers exported from `*.controller.ts` files next to the entry (and below it)
 * that serve no route: almost always a controller missing from `createApp({ controllers })`,
 * which would otherwise only show up as a 404.
 */
export async function unlistedControllers(app: InspectableApp, entry: string, cwd: string): Promise<string[]> {
    const served = new Set(app.routes.map((route) => route.handler.slice(0, route.handler.lastIndexOf("."))));
    const warnings: string[] = [];
    for (const file of controllerFiles(dirname(resolve(cwd, entry)))) {
        const module = await import(pathToFileURL(file).href);
        for (const value of Object.values(module)) {
            if (typeof value !== "function" || !Object.hasOwn(value, CONTROLLER) || served.has(value.name)) continue;
            const shown = relative(cwd, file).replaceAll("\\", "/");
            warnings.push(
                `${value.name} (${shown}) has @Controller() but serves no route. Add it to controllers in ${entry}.`,
            );
        }
    }
    return warnings;
}

/** Splits "[SPK1002] message" into its code and message. */
export function describeError(error: unknown): { code: string | undefined; message: string } {
    const raw = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: unknown } | null)?.code;
    const match = /^\[(SPK\d{4})\] /.exec(raw);
    return {
        code: typeof code === "string" ? code : match?.[1],
        message: match ? raw.slice(match[0].length) : raw,
    };
}
