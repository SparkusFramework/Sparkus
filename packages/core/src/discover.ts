import { CONTROLLER } from "./decorators.js";
import type { Class } from "./di.js";
import { ErrorCode, SparkusError } from "./errors.js";

/** `users.controller.ts`, `.js`, `.mts`...; never `.d.ts` or `.test.ts`. */
const CONTROLLER_FILE = /\.controller\.[cm]?[jt]s$/;
const CONTROLLER_GLOB = "**/*.controller.{ts,js,mts,cts,mjs,cjs}";
/** `C:\`, `\\server`, `/`: a path, not relative to the calling file. */
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:)?[\\/]/;

/**
 * The file that called `above` (createApp, createTestApp), from the V8 stack trace API,
 * which Bun implements too. Undefined on a runtime without it. Never call this in tail
 * position (`return callerFile(...)`): JavaScriptCore drops the frames of tail calls.
 */
export function callerFile(above: Function): string | undefined {
    if (typeof Error.captureStackTrace !== "function") return undefined;
    const prepare = Error.prepareStackTrace;
    const limit = Error.stackTraceLimit;
    const holder: { stack?: unknown } = {};
    try {
        Error.stackTraceLimit = 1;
        Error.prepareStackTrace = (_error, sites) => sites;
        Error.captureStackTrace(holder, above);
        const sites = holder.stack as NodeJS.CallSite[] | undefined;
        return sites?.[0]?.getFileName() ?? undefined;
    } catch {
        return undefined;
    } finally {
        Error.prepareStackTrace = prepare;
        Error.stackTraceLimit = limit;
    }
}

/** What discovery needs from the runtime. Paths are absolute; folder URLs end with "/". */
interface Host {
    url(path: string): URL;
    path(url: URL): string;
    exists(file: URL): boolean | Promise<boolean>;
    /** Controller files under `dir`, skipping node_modules and dot folders. Throws when `dir` is not a folder. */
    scan(dir: URL): string[];
}

interface BunApi {
    Glob: new (pattern: string) => { scanSync(options: { cwd: string; absolute: true; onlyFiles: true }): Iterable<string> };
    file(url: URL): { exists(): Promise<boolean> };
    pathToFileURL(path: string): URL;
    fileURLToPath(url: URL): string;
}

/**
 * Bun's own APIs under Bun: loading node:fs, node:url and node:path there costs 3.4 ms at
 * startup, more than the scan. Bun.Glob also finds the same files about 10 % faster than a
 * readdirSync walk. Node gets its modules synchronously, without an ESM job (0.2 ms, not 1.3).
 */
async function host(): Promise<Host> {
    const bun = (globalThis as { Bun?: BunApi }).Bun;
    if (bun !== undefined) {
        const glob = new bun.Glob(CONTROLLER_GLOB);
        return {
            url: bun.pathToFileURL,
            path: bun.fileURLToPath,
            exists: (file) => bun.file(file).exists(),
            scan: (dir) => {
                const found: string[] = [];
                // `dot: false`, the default, skips dot folders.
                for (const file of glob.scanSync({ cwd: bun.fileURLToPath(dir), absolute: true, onlyFiles: true })) {
                    if (!/[\\/]node_modules[\\/]/.test(file)) found.push(file);
                }
                return found;
            },
        };
    }
    // getBuiltinModule: Node 20.16+; older ones pay the dynamic import.
    const builtin = <T>(name: string): Promise<T> | T => (process.getBuiltinModule?.(name) as T | undefined) ?? import(name);
    const [fs, url, path] = await Promise.all([
        builtin<typeof import("node:fs")>("node:fs"),
        builtin<typeof import("node:url")>("node:url"),
        builtin<typeof import("node:path")>("node:path"),
    ]);
    const walk = (dir: string, found: string[]) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file, found);
            else if (CONTROLLER_FILE.test(entry.name)) found.push(file);
        }
        return found;
    };
    return {
        url: url.pathToFileURL,
        path: url.fileURLToPath,
        exists: (file) => fs.existsSync(file),
        scan: (dir) => walk(url.fileURLToPath(dir), []),
    };
}

export interface Discovered {
    controllers: Class<object>[];
    /** The scanned folder, relative to the working directory. */
    root: string;
    files: number;
}

/**
 * Set by the bundle that sparkusPlugin() builds, before any module of the app runs: the
 * controller files found at build time, imported statically. A bundle has no controller
 * files left to scan, and this makes startup skip the scan altogether.
 */
export const MANIFEST = Symbol.for("sparkus.controllers");

export interface Manifest {
    /** The source folder at build time, for messages. */
    root: string;
    /** Relative to the working directory at build time, sorted. */
    files: string[];
    /** The modules of `files`, in the same order. */
    modules: Record<string, unknown>[];
}

/**
 * Imports every `*.controller.ts` file under the source folder and returns the classes with
 * @Controller() they export, in file order. The source folder is `dir` (relative to `origin`,
 * the file that created the app), else the top folder of the package holding `origin`: `src/`
 * for `src/app.ts` or `src/users/users.test.ts`, `dist/` for `dist/app.js`.
 */
export async function discoverControllers(dir: string | undefined, origin: string | undefined): Promise<Discovered> {
    const manifest = (globalThis as Record<symbol, unknown>)[MANIFEST] as Manifest | undefined;
    if (manifest !== undefined) {
        if (dir !== undefined) {
            throw new SparkusError(
                ErrorCode.ControllerDiscovery,
                `controllers: "${dir}" in a bundle: its controllers were found at build time, in ${manifest.root}/. ` +
                    "Remove the option, or list them (controllers: [UserController]).",
            );
        }
        return { controllers: collect(manifest.files, manifest.modules), root: manifest.root, files: manifest.files.length };
    }

    // Startup only, and never loaded by an app that lists its controllers (edge runtimes).
    const io = await host();
    const { root, files } = await locate(dir, origin, io);
    if (files.length === 0) {
        throw new SparkusError(
            ErrorCode.ControllerDiscovery,
            dir === undefined
                ? `No controller file in ${root}/, the source folder of ${shown(io.path(asUrl(origin!, io)))}. ` +
                      "Name controller files <feature>.controller.ts under it (src/users/users.controller.ts), " +
                      'point to their folder (controllers: "../src"), or list them (controllers: [UserController]).'
                : `No controller file in ${root}/ (controllers: "${dir}"). ` +
                      "Name controller files <feature>.controller.ts, or list them (controllers: [UserController]).",
        );
    }

    const modules = await Promise.all(
        files.map(async (file) => {
            try {
                return (await import(io.url(file).href)) as Record<string, unknown>;
            } catch (error) {
                // A decorator or config() error already names its fix.
                if (error instanceof SparkusError) throw error;
                throw new SparkusError(
                    ErrorCode.ControllerDiscovery,
                    `${shown(file)} failed to load: ${error instanceof Error ? error.message : String(error)}`,
                    { cause: error },
                );
            }
        }),
    );
    return { controllers: collect(files.map(shown), modules), root, files: files.length };
}

/**
 * The source folder (see discoverControllers) and its controller files, absolute and sorted,
 * none when it has none. For build tools: sparkusPlugin() finds what startup would.
 */
export async function findControllerFiles(dir: string | undefined, origin: string): Promise<{ root: string; files: string[] }> {
    return locate(dir, origin, await host());
}

async function locate(dir: string | undefined, origin: string | undefined, io: Host): Promise<{ root: string; files: string[] }> {
    const from = origin === undefined ? undefined : new URL(".", asUrl(origin, io));
    let root: URL;
    if (dir !== undefined && (dir.startsWith("file:") || ABSOLUTE_PATH.test(dir))) {
        root = folder(asUrl(dir, io));
    } else if (from === undefined) {
        throw new SparkusError(
            ErrorCode.ControllerDiscovery,
            "This runtime does not tell which file created the app, so its controllers cannot be found. " +
                "Pass an absolute folder (controllers: import.meta.dirname) or list them (controllers: [UserController]).",
        );
    } else if (dir !== undefined) {
        root = new URL(folder(dir.replaceAll("\\", "/")), from);
    } else {
        root = await sourceFolder(from, io);
    }

    const shownRoot = shown(io.path(root));
    try {
        // Sorted by path: routes and errors come in the same order on every run and runtime.
        return { root: shownRoot, files: io.scan(root).sort() };
    } catch (error) {
        throw new SparkusError(
            ErrorCode.ControllerDiscovery,
            `controllers: "${dir}" is not a folder (${shownRoot}). Give a folder relative to the file calling createApp().`,
            { cause: error },
        );
    }
}

/** The @Controller() classes each module exports, in order; `files` names the modules in errors. */
function collect(files: readonly string[], modules: readonly Record<string, unknown>[]): Class<object>[] {
    const controllers: Class<object>[] = [];
    const seen = new Set<Function>();
    for (let i = 0; i < files.length; i++) {
        let found = false;
        for (const value of Object.values(modules[i]!)) {
            if (typeof value !== "function" || !Object.hasOwn(value, CONTROLLER)) continue;
            found = true;
            if (seen.has(value)) continue;
            seen.add(value);
            controllers.push(value as Class<object>);
        }
        if (!found) {
            throw new SparkusError(
                ErrorCode.ControllerDiscovery,
                `${files[i]} exports no class with @Controller(). ` +
                    "Export the controller (export class UserController), or rename the file if it holds none.",
            );
        }
    }
    return controllers;
}

function asUrl(value: string, io: Host): URL {
    return value.startsWith("file:") ? new URL(value) : io.url(value);
}

function folder<T extends string | URL>(value: T): T {
    const text = String(value);
    if (text.endsWith("/")) return value;
    return (typeof value === "string" ? `${text}/` : new URL(`${text}/`)) as T;
}

/** The top folder of the package (nearest package.json) holding `from`; `from` itself outside any package. */
async function sourceFolder(from: URL, io: Host): Promise<URL> {
    let pkg = from;
    while (!(await io.exists(new URL("package.json", pkg)))) {
        const parent = new URL("..", pkg);
        if (parent.href === pkg.href) return from;
        pkg = parent;
    }
    const top = from.href.slice(pkg.href.length).split("/")[0];
    return top === undefined || top === "" ? pkg : new URL(`${top}/`, pkg);
}

/** Relative to the working directory, for messages. */
function shown(file: string): string {
    const cwd = process.cwd();
    const relative = file.startsWith(cwd) && /[\\/]/.test(file.charAt(cwd.length)) ? file.slice(cwd.length + 1) : file;
    return relative.replace(/[\\/]+$/, "").replaceAll("\\", "/") || ".";
}
