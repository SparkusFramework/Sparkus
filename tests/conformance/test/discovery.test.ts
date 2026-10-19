// Controllers found instead of listed, four targets, twice. From the disk: the real Node process
// runs an unbundled build and calls createApp() without options, so the file it is called from,
// its package and its source folder are resolved by Node itself (file URLs in stack traces).
// From a bundle built with sparkusPlugin(): no controller file exists, the manifest written at
// build time is all there is.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { bundled, inMemory, inProcess, realNode, type Target } from "./targets.js";

const targets: Array<[string, () => Promise<Target>]> = [
    ["in-memory", () => inMemory("discovery")],
    ["bun engine", () => inProcess("bun", "discovery")],
    ["node engine in Bun", () => inProcess("node", "discovery")],
    ["node engine in Node", () => realNode("discovery")],
    ["bundled, in-memory", () => bundled("in-memory")],
    ["bundled, bun engine", () => bundled("bun")],
    ["bundled, node engine in Bun", () => bundled("node")],
    ["bundled, node engine in Node", () => bundled("real-node")],
];

test("the bundle holds no controller file", () => {
    expect([...new Bun.Glob("**/*.controller.*").scanSync(join(import.meta.dir, "..", "dist-bundled"))]).toEqual([]);
});

for (const [label, start] of targets) {
    describe(`discovery: ${label}`, () => {
        let target: Target;
        beforeAll(async () => {
            target = await start();
        });
        afterAll(() => target?.close());

        test("a controller in a nested *.controller.ts file, with its service injected", async () => {
            const res = await target.request("/items/2");
            expect(res.status).toBe(200);
            expect(res.json()).toEqual({ id: 2, name: "two" });
            const missing = await target.request("/items/9");
            expect(missing.status).toBe(404);
            expect(missing.json().code).toBe("ITEM_NOT_FOUND");
        });

        test("every controller a file exports, the default export too", async () => {
            expect((await target.request("/status")).json()).toEqual({ ok: true });
            expect((await target.request("/ping")).text).toBe("pong");
        });

        test("a controller outside a *.controller.ts file is not served", async () => {
            const res = await target.request("/hidden");
            expect(res.status).toBe(404);
            expect(res.json().code).toBe("SPK2001");
        });
    });
}
