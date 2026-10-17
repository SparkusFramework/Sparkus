import { describe, expect, test } from "bun:test";
import { parseArgs, suggest, type FlagSpecs } from "../src/args.js";
import { main } from "../src/main.js";

const specs: FlagSpecs = {
    json: { type: "boolean", description: "" },
    port: { type: "string", short: "p", description: "" },
    watch: { type: "boolean", short: "w", description: "" },
};

describe("parseArgs", () => {
    test("flags in every form", () => {
        expect(parseArgs(["dev", "--json", "--port=3000", "src/app.ts"], specs)).toEqual({
            positionals: ["dev", "src/app.ts"],
            flags: { json: true, port: "3000" },
        });
        expect(parseArgs(["--port", "80", "--no-watch"], specs).flags).toEqual({ port: "80", watch: false });
        expect(parseArgs(["-wp", "81"], specs).flags).toEqual({ watch: true, port: "81" });
        expect(parseArgs(["-p82"], specs).flags).toEqual({ port: "82" });
        expect(parseArgs(["a", "--", "--json"], specs).positionals).toEqual(["a", "--json"]);
    });

    test("errors say what to do", () => {
        expect(() => parseArgs(["--jsno"], specs)).toThrow("Unknown flag --jsno. Did you mean --json?");
        expect(() => parseArgs(["--port"], specs)).toThrow("--port needs a value.");
        expect(() => parseArgs(["--json=1"], specs)).toThrow("takes no value");
    });

    test("suggest ignores distant names", () => {
        expect(suggest("verison", ["version", "help"])).toBe("version");
        expect(suggest("deploy", ["version", "help"])).toBeUndefined();
    });
});

describe("main", () => {
    test("exit codes", async () => {
        const write = process.stdout.write;
        const errWrite = process.stderr.write;
        const out: string[] = [];
        process.stdout.write = ((chunk: string) => out.push(chunk)) as any;
        process.stderr.write = ((chunk: string) => out.push(chunk)) as any;
        try {
            expect(await main(["version", "--json"])).toBe(0);
            expect(JSON.parse(out.at(-1)!)).toEqual({ version: "1.0.0-alpha.0" });
            expect(await main(["verison"])).toBe(2);
            expect(out.at(-1)).toContain('Did you mean "version"?');
        } finally {
            process.stdout.write = write;
            process.stderr.write = errWrite;
        }
    });
});
