import { statSync, watch, type FSWatcher } from "node:fs";
import { relative, resolve } from "node:path";

export interface DevOptions {
    /** File that starts the app. */
    entry: string;
    /** Folder watched recursively. */
    watchDir: string;
    cwd: string;
    /** One JSON event per line on stdout instead of text. */
    json: boolean;
    /** Milliseconds of quiet before a restart, so a save touching several files restarts once. */
    debounce?: number;
}

type Event =
    | { event: "start"; entry: string }
    | { event: "restart"; files: string[]; ms: number }
    | { event: "exit"; code: number | null };

type Child = ReturnType<typeof Bun.spawn>;

const IGNORED = /(^|[\\/])(node_modules|\.git|dist)([\\/]|$)|~$|\.(swp|tmp)$/;

/**
 * The Bun binary itself. `Bun.which("bun")` can be a shell shim (npm on Windows):
 * killing the shim would leave the real process, and the app, running.
 */
function bunBinary(): string {
    if (/[\\/]bun(\.exe)?$/i.test(process.execPath)) return process.execPath;
    return Bun.which("bun") ?? process.execPath;
}

/** Stops a process and its children. Windows has no SIGTERM: the tree is terminated. */
function kill(proc: Child, force: boolean): void {
    if (process.platform === "win32") {
        Bun.spawnSync(["taskkill", "/pid", String(proc.pid), "/t", "/f"], { stdout: "ignore", stderr: "ignore" });
    } else {
        proc.kill(force ? "SIGKILL" : "SIGTERM");
    }
}

function isDirectory(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

/**
 * `sparkus dev`: runs the app in a child process and restarts it when a file
 * under watchDir changes. Our own supervisor (no `bun --watch`, no `--hot`):
 * the framework never carries watch code, and agents get a JSON event stream.
 */
export function dev(options: DevOptions): Promise<number> {
    const bun = bunBinary();
    const entry = resolve(options.cwd, options.entry);
    const root = resolve(options.cwd, options.watchDir);
    const emit = (event: Event, text: string) =>
        process.stdout.write((options.json ? JSON.stringify(event) : text) + "\n");

    let child: Child | undefined;
    let changed = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let restarting = false;

    const start = () => {
        const proc = Bun.spawn([bun, entry], {
            cwd: options.cwd,
            env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "development" },
            stdio: ["inherit", "inherit", "inherit"],
        });
        child = proc;
        proc.exited.then((code) => {
            if (child === proc && !restarting) emit({ event: "exit", code }, `✗ app exited (${code}), waiting for changes...`);
        });
    };

    const stop = async () => {
        const proc = child;
        if (proc === undefined || proc.exitCode !== null) return;
        kill(proc, false);
        const timeout = new Promise((done) => setTimeout(done, 2_000));
        if ((await Promise.race([proc.exited.then(() => "exited"), timeout])) !== "exited") kill(proc, true);
        await proc.exited;
    };

    const restart = async () => {
        if (restarting) return;
        restarting = true;
        const files = [...changed];
        changed = new Set();
        const started = performance.now();
        await stop();
        start();
        restarting = false;
        const ms = Math.round(performance.now() - started);
        const shown = files.slice(0, 3).join(", ") + (files.length > 3 ? "..." : "");
        emit({ event: "restart", files, ms }, `↻ ${shown} (${ms} ms)`);
        if (changed.size > 0) schedule();
    };

    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(restart, options.debounce ?? 60);
    };

    const watcher: FSWatcher = watch(root, { recursive: true }, (_event, file) => {
        if (file === null || IGNORED.test(file)) return;
        const path = resolve(root, file.toString());
        if (isDirectory(path)) return;
        changed.add(relative(options.cwd, path).replaceAll("\\", "/"));
        schedule();
    });

    emit({ event: "start", entry: options.entry }, `sparkus dev: ${options.entry}, watching ${options.watchDir}/`);
    start();

    return new Promise((done) => {
        const shutdown = async () => {
            watcher.close();
            clearTimeout(timer);
            await stop();
            done(0);
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
    });
}
