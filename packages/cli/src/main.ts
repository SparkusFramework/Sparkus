#!/usr/bin/env node
import { ArgsError, parseArgs, suggest, type FlagSpecs } from "./args.js";

const VERSION = "1.0.0-alpha.0";

const GLOBAL_FLAGS: FlagSpecs = {
    help: { type: "boolean", short: "h", description: "Show help." },
    version: { type: "boolean", short: "v", description: "Print the version." },
    json: { type: "boolean", description: "Machine-readable output (one JSON document on stdout)." },
};

interface Command {
    summary: string;
    run(args: { json: boolean; positionals: string[] }): number | Promise<number>;
}

const COMMANDS: Record<string, Command> = {
    version: {
        summary: "Print the CLI version.",
        run: ({ json }) => {
            print(json, { version: VERSION }, `sparkus ${VERSION}`);
            return 0;
        },
    },
    help: {
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
        print(true, { commands: Object.entries(COMMANDS).map(([name, c]) => ({ name, summary: c.summary })), flags: GLOBAL_FLAGS }, "");
        return;
    }
    const lines = [
        `sparkus ${VERSION}`,
        "",
        "Usage: sparkus <command> [flags]",
        "",
        "Commands:",
        ...Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(12)} ${c.summary}`),
        "",
        "Flags:",
        ...Object.entries(GLOBAL_FLAGS).map(
            ([name, f]) => `  ${(f.short ? `-${f.short}, ` : "    ") + `--${name}`}`.padEnd(18) + ` ${f.description}`,
        ),
    ];
    print(false, null, lines.join("\n"));
}

export async function main(argv: readonly string[]): Promise<number> {
    let json = argv.includes("--json");
    try {
        const { positionals, flags } = parseArgs(argv, GLOBAL_FLAGS);
        json = flags.json === true;
        if (flags.version === true) return COMMANDS.version!.run({ json, positionals });
        const name = positionals[0] ?? "help";
        if (flags.help === true || name === "help") return COMMANDS.help!.run({ json, positionals });
        const command = COMMANDS[name];
        if (command === undefined) {
            const hint = suggest(name, Object.keys(COMMANDS));
            throw new ArgsError(`Unknown command "${name}".${hint ? ` Did you mean "${hint}"?` : ""} Run sparkus help.`);
        }
        return await command.run({ json, positionals: positionals.slice(1) });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (json) process.stdout.write(JSON.stringify({ error: { message } }) + "\n");
        else process.stderr.write(`error: ${message}\n`);
        return error instanceof ArgsError ? 2 : 1;
    }
}

const entry = process.argv[1];
if (entry !== undefined && /main\.(ts|js)$|sparkus(\.exe)?$/.test(entry)) {
    main(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
