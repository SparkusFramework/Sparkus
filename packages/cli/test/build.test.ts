import { afterAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { main } from "../src/main.js";

const project = join(import.meta.dir, "fixtures-build");
// Inside the fixture: it inherits its "type": "module", like dist/ in a real project.
const out = join(project, "dist");
afterAll(() => rmSync(out, { recursive: true, force: true }));

async function run(argv: string[]) {
    const lines: string[] = [];
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string) => lines.push(chunk)) as any;
    try {
        return { code: await main(argv), out: lines.join("") };
    } finally {
        process.stdout.write = write;
    }
}

describe("sparkus build", () => {
    test("bundles the app with its controllers found at build time", async () => {
        const res = await run(["build", join(project, "src", "main.ts"), "--out", out, "--target", "node", "--json"]);
        expect(res.code).toBe(0);
        const result = JSON.parse(res.out);
        expect(result).toMatchObject({ ok: true, target: "node", controllers: 1 });
        expect(result.files.some((file: string) => file.endsWith("dist/main.js"))).toBe(true);
        expect([...new Bun.Glob("**/*.controller.*").scanSync(out)]).toEqual([]);

        for (const runtime of [process.execPath, "node"]) {
            const proc = Bun.spawn([runtime, join(out, "main.js")], { stdout: "pipe", stderr: "pipe" });
            const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
            expect(code, await new Response(proc.stderr).text()).toBe(0);
            expect(JSON.parse(text)).toEqual(["ItemController.list"]);
        }
    });

    test("usage errors", async () => {
        const missing = await run(["build", join(project, "src", "nope.ts"), "--json"]);
        expect(missing.code).toBe(2);
        expect(JSON.parse(missing.out).error.message).toEndWith("nope.ts not found.");
        const target = await run(["build", join(project, "src", "main.ts"), "--target", "deno", "--json"]);
        expect(JSON.parse(target.out).error.message).toBe("--target deno: use bun or node.");
    });
});
