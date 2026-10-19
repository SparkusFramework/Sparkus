import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestApp } from "@sparkus/testing";
import { generateClient, tsType } from "../src/client.js";
import { main } from "../src/main.js";
import app, { options } from "./fixtures/client-app.js";
import { ApiError, createClient } from "./fixtures/client/api.js";

const GOLDEN = join(import.meta.dir, "fixtures/client/api.ts");

await app.init();
const api = createClient({ baseUrl: "http://api.test/", fetch: (request) => app.fetch(request) });

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
    try {
        await promise;
    } catch (error) {
        if (error instanceof ApiError) return error;
        throw error;
    }
    throw new Error("expected an ApiError");
}

describe("generated client", () => {
    test("is up to date with the generator (fixtures/client/api.ts)", () => {
        const expected = readFileSync(GOLDEN, "utf8").replaceAll("\r\n", "\n");
        // To update: bun packages/cli/src/main.ts client packages/cli/test/fixtures/client-app.ts --out packages/cli/test/fixtures/client/api.ts
        expect(generateClient(app.openapi()).code).toBe(expected);
    });

    test("typed calls: params, query, body, response", async () => {
        const article = await api.article.get({ params: { id: 1 } });
        const title: string = article.title;
        expect(title).toBe("Hello");
        // The response schema filtered the author's email out.
        expect(article).toEqual({ id: 1, title: "Hello", tags: ["intro"], author: { name: "Ada" } });

        expect(await api.article.list()).toHaveLength(1);
        expect(await api.article.list({ query: { tag: "none" } })).toEqual([]);
        expect(await api.article.create({ body: { title: "New" } })).toEqual({ id: 2, title: "New", tags: [] });
        expect(await api.article.search({ query: { q: "a b&c", exact: true } })).toEqual({ q: "a b&c", exact: true });
        expect(await api.health.check()).toBe("ok");
        expect(await api.health.setState({ params: { service: "a/b c" } })).toEqual({ service: "a/b c" });
    });

    test("errors are ApiError with the problem details", async () => {
        const missing = await rejection(api.article.get({ params: { id: 999 } }));
        expect(missing.status).toBe(404);
        expect(missing.code).toBe("ARTICLE_NOT_FOUND");
        expect(missing.message).toBe("Article 999 not found.");

        const invalid = await rejection(api.article.get({ params: { id: 0 } }));
        expect(invalid.code).toBe("SPK2004");
        expect(invalid.problem.issues).toEqual([{ path: "params.id", message: "must be >= 1" }]);
    });

    test("headers: per call and shared", async () => {
        expect((await rejection(api.article.remove({ params: { id: "1" } }))).code).toBe("NOT_ADMIN");
        expect(await api.article.remove({ params: { id: "1" } }, { headers: { authorization: "Bearer admin" } })).toBeUndefined();

        const admin = createClient({
            baseUrl: "http://api.test",
            headers: async () => ({ authorization: "Bearer admin" }),
            fetch: (request) => app.fetch(request),
        });
        expect(await admin.article.remove({ params: { id: "1" } })).toBeUndefined();
    });

    test("plugs into createTestApp as llms.txt says (issue #21)", async () => {
        const testApp = await createTestApp(options);
        try {
            const client = createClient({ baseUrl: "http://test", fetch: (request) => testApp.fetch(request) });
            expect((await client.article.get({ params: { id: 1 } })).title).toBe("Hello");
            expect((await rejection(client.article.get({ params: { id: 999 } }))).status).toBe(404);

            const unbound = createClient({ baseUrl: "http://test", fetch: testApp.fetch });
            expect(await unbound.health.check()).toBe("ok");
        } finally {
            await testApp.close();
        }
    });

    test("wrong inputs do not compile", () => {
        const check = () => {
            // @ts-expect-error id is a number
            void api.article.get({ params: { id: "1" } });
            // @ts-expect-error q is required
            void api.article.search({ query: {} });
            // @ts-expect-error the body needs a title
            void api.article.create({ body: { tags: [] } });
        };
        expect(check).toBeFunction();
    });
});

describe("tsType", () => {
    test("covers what route schemas and libraries produce", () => {
        expect(tsType({ type: ["string", "null"] })).toBe("string | null");
        expect(tsType({ anyOf: [{ type: "integer" }, { type: "null" }] })).toBe("number | null");
        expect(tsType({ enum: ["a", "b"] })).toBe('"a" | "b"');
        expect(tsType({ type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } })).toBe("(string | number)[]");
        expect(tsType({ type: "object", additionalProperties: { type: "boolean" } })).toBe("Record<string, boolean>");
        expect(tsType({ type: "object", properties: { "a-b": { type: "string" } }, required: ["a-b"] })).toBe('{ "a-b": string }');
        expect(tsType({})).toBe("unknown");
    });
});

describe("sparkus client", () => {
    test("prints the client, or writes it with --out", async () => {
        const out: string[] = [];
        const write = process.stdout.write;
        process.stdout.write = ((chunk: string) => out.push(chunk)) as any;
        try {
            expect(await main(["client", join(import.meta.dir, "fixtures/client-app.ts")])).toBe(0);
        } finally {
            process.stdout.write = write;
        }
        expect(out.join("")).toContain("export function createClient(options: ClientOptions)");
    });
});
