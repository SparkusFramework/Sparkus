import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { main } from "../src/main.js";

const fixtures = join(import.meta.dir, "fixtures");

async function run(argv: string[]) {
    const out: string[] = [];
    const write = process.stdout.write;
    const errWrite = process.stderr.write;
    process.stdout.write = ((chunk: string) => out.push(chunk)) as any;
    process.stderr.write = ((chunk: string) => out.push(chunk)) as any;
    try {
        const code = await main(argv);
        return { code, out: out.join("") };
    } finally {
        process.stdout.write = write;
        process.stderr.write = errWrite;
    }
}

describe("sparkus check / routes", () => {
    test("a valid app", async () => {
        const res = await run(["check", join(fixtures, "ok-app.ts"), "--json"]);
        expect(res.code).toBe(0);
        expect(JSON.parse(res.out)).toMatchObject({ ok: true, routes: 2 });
    });

    test("a wiring error is reported with its code", async () => {
        const res = await run(["check", join(fixtures, "cycle-app.ts"), "--json"]);
        expect(res.code).toBe(1);
        expect(JSON.parse(res.out)).toMatchObject({
            ok: false,
            error: {
                code: "SPK1002",
                message: "Dependency cycle: A -> B -> A, reached from Root. Move what both need into a third service.",
            },
        });
        const human = await run(["check", join(fixtures, "cycle-app.ts")]);
        expect(human.out).toStartWith("✗ [SPK1002] Dependency cycle");
    });

    test("routes", async () => {
        const res = await run(["routes", join(fixtures, "ok-app.ts"), "--json"]);
        const routes = JSON.parse(res.out).routes as Array<{ method: string; path: string }>;
        expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /items/:id", "POST /items"]);
        const human = await run(["routes", join(fixtures, "ok-app.ts")]);
        expect(human.out).toContain("POST    /items      Items.create -> 201  (body)");
    });

    test("a missing entry is a usage error", async () => {
        const res = await run(["check", "nope.ts", "--json"]);
        expect(res.code).toBe(2);
        expect(JSON.parse(res.out).error.message).toBe("nope.ts not found.");
    });
});
