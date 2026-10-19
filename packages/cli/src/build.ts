import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CliError } from "./app-loader.js";

export interface BuildOptions {
    /** Output folder. Default: dist. */
    out?: string;
    /** Default: bun. */
    target?: string;
}

export interface BuildResult {
    entry: string;
    out: string;
    target: "bun" | "node";
    /** Written files, relative to the working directory. */
    files: string[];
    /** Controller files imported by the bundle; 0 when the app lists its controllers. */
    controllers: number;
}

type PluginFactory = (options: { onControllers(entry: string, root: string, files: readonly string[]): void }) => unknown;

/** sparkusPlugin from the project's own framework: the CLI does not depend on it. */
async function loadPlugin(from: string): Promise<PluginFactory> {
    for (const specifier of ["sparkus/build", "@sparkus/core/build"]) {
        let path: string;
        try {
            path = Bun.resolveSync(specifier, from);
        } catch {
            continue;
        }
        return ((await import(pathToFileURL(path).href)) as { sparkusPlugin: PluginFactory }).sparkusPlugin;
    }
    throw new CliError(`sparkus build needs the "sparkus" package next to ${relative(process.cwd(), from) || "."}: bun add sparkus`);
}

/**
 * Bundles the app for production with Bun.build: one file per entry point (plus shared chunks),
 * controllers imported statically by sparkusPlugin(), so startup scans nothing.
 */
export async function buildApp(entry: string | undefined, options: BuildOptions, cwd: string): Promise<BuildResult> {
    const file = entry ?? "src/main.ts";
    const path = resolve(cwd, file);
    if (!existsSync(path)) {
        throw new CliError(
            entry === undefined
                ? "No src/main.ts. Pass the file that starts the app (the one calling listen()): sparkus build src/server.ts"
                : `${entry} not found.`,
        );
    }
    const target = options.target ?? "bun";
    if (target !== "bun" && target !== "node") throw new CliError(`--target ${target}: use bun or node.`);
    const out = options.out ?? "dist";

    const sparkusPlugin = await loadPlugin(dirname(path));
    let controllers = 0;
    const result = await Bun.build({
        entrypoints: [path],
        outdir: resolve(cwd, out),
        target,
        format: "esm",
        sourcemap: "linked",
        // Names stay: routes, logs and errors say UserController.get, not a.b.
        minify: { whitespace: true, syntax: true, identifiers: false },
        plugins: [sparkusPlugin({ onControllers: (_entry, _root, files) => void (controllers = files.length) }) as Bun.BunPlugin],
    });
    if (!result.success) {
        throw new CliError(`Build of ${file} failed:\n${result.logs.map(String).join("\n")}`);
    }
    return {
        entry: file,
        out,
        target,
        files: result.outputs.map((output) => relative(cwd, output.path).replaceAll("\\", "/")),
        controllers,
    };
}
