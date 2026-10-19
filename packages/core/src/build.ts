// Build tools: what turns a Sparkus app into a bundle. Applications import it from
// "sparkus/build" in a build script; `sparkus build` uses it for them. Build time only:
// never part of an app, so Node modules are imported as usual.
import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { findControllerFiles } from "./discover.js";

/** The part of Bun's plugin builder this plugin uses (structural: no dependency on bun-types). */
export interface PluginBuild {
    readonly config: { readonly entrypoints: readonly string[] };
    onResolve(
        options: { filter: RegExp; namespace?: string },
        callback: (args: { path: string }) => { path: string; namespace: string } | undefined,
    ): unknown;
    onLoad(
        options: { filter: RegExp; namespace?: string },
        callback: (args: { path: string }) => Promise<LoadResult | undefined> | LoadResult | undefined,
    ): unknown;
}

interface LoadResult {
    contents: string;
    loader: "js" | "jsx" | "ts" | "tsx";
}

export interface SparkusPlugin {
    readonly name: string;
    setup(build: PluginBuild): void;
}

export interface SparkusPluginOptions {
    /** Called once per entry point: its source folder and the controller files found there (maybe none). */
    onControllers?(entry: string, root: string, files: readonly string[]): void;
}

const VIRTUAL = "sparkus:controllers?";
const NAMESPACE = "sparkus-controllers";

const LOADERS: Record<string, LoadResult["loader"]> = {
    ".ts": "ts",
    ".mts": "ts",
    ".cts": "ts",
    ".tsx": "tsx",
    ".js": "js",
    ".mjs": "js",
    ".cjs": "js",
    ".jsx": "jsx",
};

const slashes = (path: string) => path.replaceAll("\\", "/");

/**
 * Bun.build plugin: finds the controller files at build time, as `createApp()` would at startup
 * (every `*.controller.ts` in the source folder of each entry point), and imports them
 * statically from a module that runs before the entry point. The bundle then serves them
 * without scanning anything; without the plugin, a bundle has no controller files to find.
 *
 *     await Bun.build({ entrypoints: ["src/main.ts"], outdir: "dist", plugins: [sparkusPlugin()] });
 *
 * An entry point whose source folder holds no controller file is left as it is.
 */
export function sparkusPlugin(options: SparkusPluginOptions = {}): SparkusPlugin {
    return {
        name: "sparkus",
        setup(build) {
            const entries = new Set(build.config.entrypoints.map((entry) => resolve(entry)));
            // The manifest module of each entry point, undefined when it has no controller file. Keyed by
            // a number, not the entry's path: a path would inherit `"sideEffects": false` from its package.json,
            // and the bundler would drop a module that only has side effects.
            const manifests = new Map<string, Promise<string | undefined>>();
            const ids = new Map<string, string>();
            const manifest = async (entry: string): Promise<string | undefined> => {
                const { root, files } = await findControllerFiles(undefined, entry);
                options.onControllers?.(entry, root, files);
                if (files.length === 0) return undefined;
                const imports = files.map((file, i) => `import * as m${i} from ${JSON.stringify(slashes(file))};\n`);
                const shown = JSON.stringify(files.map((file) => slashes(relative(".", file))));
                const modules = files.map((_, i) => `m${i}`).join(", ");
                return (
                    imports.join("") +
                    `globalThis[Symbol.for("sparkus.controllers")] = ` +
                    `{ root: ${JSON.stringify(root)}, files: ${shown}, modules: [${modules}] };\n`
                );
            };

            build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
                if (!entries.has(args.path)) return undefined;
                let id = ids.get(args.path);
                if (id === undefined) {
                    id = String(ids.size);
                    ids.set(args.path, id);
                    manifests.set(id, manifest(args.path));
                }
                const code = await manifests.get(id)!;
                const source = await readFile(args.path, "utf8");
                const loader = LOADERS[extname(args.path).toLowerCase()] ?? "ts";
                if (code === undefined) return { contents: source, loader };
                // First import of the entry point: ESM runs it, and so the controllers, before any other module of the app.
                return { contents: `import ${JSON.stringify(VIRTUAL + id)};\n${source}`, loader };
            });
            build.onResolve({ filter: /^sparkus:controllers\?/ }, (args) => ({
                path: args.path.slice(VIRTUAL.length),
                namespace: NAMESPACE,
            }));
            build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async (args) => ({
                contents: (await manifests.get(args.path)) ?? "",
                loader: "js",
            }));
        },
    };
}
