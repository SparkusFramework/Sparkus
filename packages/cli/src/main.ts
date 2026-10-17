#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CliError, describeError, loadApp, unlistedControllers } from "./app-loader.js";
import { ArgsError, parseArgs, suggest, type FlagSpecs } from "./args.js";
import { generateClient } from "./client.js";
import { dev } from "./dev.js";
import { initProject } from "./init.js";

const VERSION = "1.0.0-alpha.0";

const GLOBAL_FLAGS: FlagSpecs = {
    help: { type: "boolean", short: "h", description: "Show help." },
    version: { type: "boolean", short: "v", description: "Print the version." },
    json: { type: "boolean", description: "Machine-readable output (JSON on stdout)." },
    watch: { type: "string", description: "Folder watched by dev (default: src)." },
    out: { type: "string", description: "File written by client (default: stdout)." },
};

interface Command {
    usage: string;
    summary: string;
    run(args: { json: boolean; positionals: string[]; flags: Record<string, string | boolean> }): number | Promise<number>;
}

const COMMANDS: Record<string, Command> = {
    init: {
        usage: "init <dir>",
        summary: "Create a project ready for agents: app, tests, AGENTS.md, CLAUDE.md, skills, check hook.",
        run: ({ json, positionals }) => {
            const dir = positionals[0];
            if (dir === undefined) throw new ArgsError("Missing folder: sparkus init my-api");
            const { root, name, files } = initProject(dir, process.cwd());
            print(
                json,
                { ok: true, root, name, files },
                [`✓ ${name}: ${files.length} files in ${dir}`, "", `  cd ${dir}`, "  bun install", "  bun test", "  bun run dev"].join(
                    "\n",
                ),
            );
            return 0;
        },
    },
    dev: {
        usage: "dev [entry]",
        summary: "Run the app (src/main.ts) and restart it on every change under src/.",
        run: ({ json, positionals, flags }) =>
            dev({
                entry: positionals[0] ?? "src/main.ts",
                watchDir: typeof flags.watch === "string" ? flags.watch : "src",
                cwd: process.cwd(),
                json,
            }),
    },
    check: {
        usage: "check [entry]",
        summary:
            "Load the app and wire it (DI, routes, schemas) without listening. Reports the first error, " +
            "and controllers missing from the app.",
        run: async ({ json, positionals }) => {
            const { app, entry } = await loadApp(positionals[0], process.cwd());
            try {
                await app.init();
            } catch (error) {
                const { code, message } = describeError(error);
                print(json, { ok: false, entry, error: { code, message } }, `✗ ${code ? `[${code}] ` : ""}${message}`);
                return 1;
            }
            const count = app.routes.length;
            const warnings = await unlistedControllers(app, entry, process.cwd());
            print(
                json,
                warnings.length > 0 ? { ok: true, entry, routes: count, warnings } : { ok: true, entry, routes: count },
                [`✓ ${entry}: ${count} routes, ready.`, ...warnings.map((warning) => `! ${warning}`)].join("\n"),
            );
            return 0;
        },
    },
    routes: {
        usage: "routes [entry]",
        summary: "List the routes: method, path, handler, status, body schema, guards, interceptors.",
        run: async ({ json, positionals }) => {
            const { app } = await loadApp(positionals[0], process.cwd());
            await app.init();
            const routes = app.routes;
            if (json) {
                print(true, { routes }, "");
                return 0;
            }
            const width = Math.max(4, ...routes.map((r) => r.path.length));
            const lines = routes.map((r) => {
                const extras = [
                    r.body ? "body" : "",
                    r.guards ? `${r.guards} guard(s)` : "",
                    r.interceptors ? `${r.interceptors} interceptor(s)` : "",
                ]
                    .filter(Boolean)
                    .join(", ");
                const status = r.status === 200 ? "" : ` -> ${r.status}`;
                return `${r.method.padEnd(7)} ${r.path.padEnd(width)}  ${r.handler}${status}${extras ? `  (${extras})` : ""}`;
            });
            print(false, null, lines.join("\n"));
            return 0;
        },
    },
    openapi: {
        usage: "openapi [entry]",
        summary: "Print the OpenAPI 3.1 document generated from the route schemas.",
        run: async ({ positionals }) => {
            const { app } = await loadApp(positionals[0], process.cwd());
            await app.init();
            print(true, app.openapi(), "");
            return 0;
        },
    },
    client: {
        usage: "client [entry] [--out file]",
        summary: "Generate a typed TypeScript client (one file, no dependency) from the route schemas.",
        run: async ({ json, positionals, flags }) => {
            const { app, entry } = await loadApp(positionals[0], process.cwd());
            await app.init();
            const { code, routes } = generateClient(app.openapi());
            const out = typeof flags.out === "string" ? flags.out : undefined;
            if (out === undefined) {
                process.stdout.write(code);
                return 0;
            }
            const file = resolve(process.cwd(), out);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, code);
            print(json, { ok: true, entry, file: out, routes }, `✓ ${out}: client for ${routes} routes.`);
            return 0;
        },
    },
    version: {
        usage: "version",
        summary: "Print the CLI version.",
        run: ({ json }) => {
            print(json, { version: VERSION }, `sparkus ${VERSION}`);
            return 0;
        },
    },
    help: {
        usage: "help",
        summary: "Show this help.",
        run: ({ json }) => {
            printHelp(json);
            return 0;
        },
    },
};

function print(json: boolean, data: unknown, text: string): void {
    process.stdout.write((json ? JSON.stringify(data) : text) + "\n");
}

function printHelp(json: boolean): void {
    if (json) {
        const commands = Object.entries(COMMANDS).map(([name, c]) => ({ name, usage: c.usage, summary: c.summary }));
        print(true, { commands, flags: GLOBAL_FLAGS }, "");
        return;
    }
    const lines = [
        `sparkus ${VERSION}`,
        "",
        "Usage: sparkus <command> [flags]",
        "",
        "Commands:",
        ...Object.values(COMMANDS).map((c) => `  ${c.usage.padEnd(18)} ${c.summary}`),
        "",
        "Flags:",
        ...Object.entries(GLOBAL_FLAGS).map(
            ([name, f]) => `  ${(f.short ? `-${f.short}, ` : "    ") + `--${name}`}`.padEnd(20) + ` ${f.description}`,
        ),
        "",
        "The entry is a module exporting the app (export default app), src/app.ts by default.",
    ];
    print(false, null, lines.join("\n"));
}

export async function main(argv: readonly string[]): Promise<number> {
    let json = argv.includes("--json");
    try {
        const { positionals, flags } = parseArgs(argv, GLOBAL_FLAGS);
        json = flags.json === true;
        if (flags.version === true) return COMMANDS.version!.run({ json, positionals, flags });
        const name = positionals[0] ?? "help";
        if (flags.help === true || name === "help") return COMMANDS.help!.run({ json, positionals, flags });
        const command = COMMANDS[name];
        if (command === undefined) {
            const hint = suggest(name, Object.keys(COMMANDS));
            throw new ArgsError(`Unknown command "${name}".${hint ? ` Did you mean "${hint}"?` : ""} Run sparkus help.`);
        }
        return await command.run({ json, positionals: positionals.slice(1), flags });
    } catch (error) {
        const { code, message } = describeError(error);
        if (json) process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }) + "\n");
        else process.stderr.write(`error: ${code ? `[${code}] ` : ""}${message}\n`);
        return error instanceof ArgsError || error instanceof CliError ? 2 : 1;
    }
}

const entry = process.argv[1];
if (entry !== undefined && /main\.(ts|js)$|sparkus(\.exe)?$/.test(entry)) {
    main(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
