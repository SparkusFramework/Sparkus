// One behavior suite, four targets. Any difference between engines is a bug.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inMemory, inProcess, realNode, type Reply, type Target } from "./targets.js";

const JSON_BODY = { "content-type": "application/json" };

function expectJson(res: Reply, status: number, body: unknown) {
    expect(res.status).toBe(status);
    expect(res.headers.get("content-type")).toStartWith("application/json");
    expect(res.json()).toEqual(body);
}

function expectProblem(res: Reply, status: number, fields: Record<string, unknown>) {
    expect(res.status).toBe(status);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    const problem = res.json();
    expect(problem).toMatchObject({ type: "about:blank", status, ...fields });
    expect(typeof problem.title).toBe("string");
    expect(res.text).not.toContain("    at ");
    return problem;
}

const targets: Array<[string, () => Promise<Target>]> = [
    ["in-memory", inMemory],
    ["bun engine", () => inProcess("bun")],
    ["node engine in Bun", () => inProcess("node")],
    ["node engine in Node", realNode],
];

for (const [label, start] of targets) {
    describe(label, () => {
        let target: Target;
        beforeAll(async () => {
            target = await start();
        });
        afterAll(() => target?.close());

        describe("responses", () => {
            test("JSON object", async () => {
                expectJson(await target.request("/"), 200, { hello: "world" });
            });

            test("onInit hooks ran before the first request, token factory gives the default", async () => {
                expectJson(await target.request("/greeting"), 200, { greeting: "hello", ready: true });
            });

            test("string is sent as text/plain", async () => {
                const res = await target.request("/text");
                expect(res.status).toBe(200);
                expect(res.headers.get("content-type")).toStartWith("text/plain");
                expect(res.text).toBe("plain text");
            });

            test("undefined is 204 without body", async () => {
                const res = await target.request("/empty");
                expect(res.status).toBe(204);
                expect(res.text).toBe("");
            });

            test("undefined keeps a declared non-200 status", async () => {
                const res = await target.request("/created-empty");
                expect(res.status).toBe(201);
                expect(res.text).toBe("");
            });

            test("declared status", async () => {
                expectJson(await target.request("/accepted", { method: "POST" }), 202, { ok: true });
            });

            test("status and headers set from the context", async () => {
                const res = await target.request("/status");
                expectJson(res, 418, { teapot: true });
                expect(res.headers.get("x-custom")).toBe("yes");
            });

            test("null is JSON", async () => {
                expectJson(await target.request("/null"), 200, null);
            });

            test("bytes are application/octet-stream", async () => {
                const res = await target.request("/bytes");
                expect(res.status).toBe(200);
                expect(res.headers.get("content-type")).toBe("application/octet-stream");
                expect(res.text).toBe("\x01\x02\x03");
            });

            test("a Response is sent as is", async () => {
                const res = await target.request("/response");
                expect(res.status).toBe(207);
                expect(res.headers.get("x-raw")).toBe("1");
                expect(res.text).toBe("raw");
            });

            test("HEAD falls back to GET without body", async () => {
                const res = await target.request("/users/1", { method: "HEAD" });
                expect(res.status).toBe(200);
                expect(res.text).toBe("");
            });
        });

        describe("routing", () => {
            test("params, query and injected service", async () => {
                expectJson(await target.request("/users/42?fields=name%2Cemail&x=1"), 200, {
                    id: "42",
                    name: "User 42",
                    fields: "name,email",
                });
            });

            test("query: first key wins, decoded, no inherited keys", async () => {
                const qs = "__proto__=a&toString=b&x=1&x=2&plus=a+b%21&bad=%E0%A4%A&empty&=v&&";
                expectJson(await target.request("/query?" + qs), 200, {
                    keys: ["__proto__", "toString", "x", "plus", "bad", "empty", ""],
                    values: ["a", "b", "1", "a b!", "%E0%A4%A", "", "v"],
                    inherited: "undefined",
                });
                expectJson(await target.request("/query"), 200, { keys: [], values: [], inherited: "undefined" });
            });

            test("params are decoded", async () => {
                expectJson(await target.request("/users/hello%20world"), 200, {
                    id: "hello world",
                    name: "User hello world",
                    fields: null,
                });
            });

            test("two params", async () => {
                expectJson(await target.request("/users/1/posts/2"), 200, { id: "1", postId: "2" });
            });

            test("static segment wins over a parameter", async () => {
                expectJson(await target.request("/users/me"), 200, { me: true });
            });

            test("a parameter route still serves other methods on a static path", async () => {
                expectJson(await target.request("/users/me", { method: "DELETE" }), 200, { deleted: "me" });
            });

            test("backtracking from a static branch to a parameter", async () => {
                expectJson(await target.request("/files/static/meta"), 200, { kind: "meta" });
                expectJson(await target.request("/files/static/raw"), 200, { raw: "static" });
            });

            test("async handler reads request headers", async () => {
                expectJson(await target.request("/users/7/async", { headers: { "X-Agent": "claude" } }), 200, {
                    id: "7",
                    agent: "claude",
                });
            });

            test("unknown path is 404", async () => {
                expectProblem(await target.request("/nope"), 404, { code: "SPK2001" });
            });

            test("trailing slash is a different path", async () => {
                expectProblem(await target.request("/users/"), 404, { code: "SPK2001" });
            });

            test("known path, other method is 405 with Allow", async () => {
                const res = await target.request("/users/1", { method: "PATCH" });
                expectProblem(res, 405, { code: "SPK2002" });
                expect(res.headers.get("allow")).toBe("GET, HEAD, PUT, DELETE");
            });
        });

        describe("typed params and query", () => {
            test("values are converted before guards and the handler", async () => {
                expectJson(await target.request("/typed/42?page=2&draft=true&other=x"), 200, {
                    id: 42,
                    page: 2,
                    draft: true,
                    pageType: "number",
                });
                expectJson(await target.request("/typed/7"), 200, { id: 7, page: null, draft: null, pageType: "undefined" });
            });

            test("an invalid path parameter is 400 naming it", async () => {
                const res = await target.request("/typed/abc");
                expectProblem(res, 400, {
                    code: "SPK2004",
                    detail: 'Invalid path parameter "id": must be an integer.',
                    issues: [{ path: "params.id", message: "must be an integer" }],
                });
                expectProblem(await target.request("/typed/0"), 400, { issues: [{ path: "params.id", message: "must be >= 1" }] });
            });

            test("an invalid query parameter is 400 naming it", async () => {
                expectProblem(await target.request("/typed/5?page=two"), 400, {
                    detail: 'Invalid query parameter "page": must be an integer.',
                });
                expectProblem(await target.request("/typed/5?draft=maybe"), 400, {
                    issues: [{ path: "query.draft", message: 'must be "true", "false", "1" or "0"' }],
                });
            });
        });

        describe("body", () => {
            test("valid body", async () => {
                const res = await target.request("/users", {
                    method: "POST",
                    headers: JSON_BODY,
                    body: JSON.stringify({ name: "Ada", age: 36 }),
                });
                expectJson(res, 201, { id: 1, name: "Ada", age: 36, tags: [] });
            });

            test("body on a parameter route", async () => {
                const res = await target.request("/users/5", {
                    method: "PUT",
                    headers: JSON_BODY,
                    body: JSON.stringify({ name: "Grace" }),
                });
                expectJson(res, 200, { id: "5", name: "Grace" });
            });

            test("invalid body is 400 with the failing path", async () => {
                const res = await target.request("/users", {
                    method: "POST",
                    headers: JSON_BODY,
                    body: JSON.stringify({ name: "Ada", age: 3.5, tags: ["a", 2] }),
                });
                expectProblem(res, 400, {
                    code: "SPK2004",
                    issues: [{ path: "$.age", message: "must be an integer" }],
                });
            });

            test("malformed JSON is 400", async () => {
                const res = await target.request("/users", { method: "POST", headers: JSON_BODY, body: "{nope" });
                expectProblem(res, 400, { code: "SPK2003", detail: "Request body is not valid JSON." });
            });

            test("empty body is 400", async () => {
                const res = await target.request("/users", { method: "POST", headers: JSON_BODY, body: "" });
                expectProblem(res, 400, { code: "SPK2003", detail: "Request body is empty, expected JSON." });
            });

            test("non-JSON content type is 415", async () => {
                const res = await target.request("/users", {
                    method: "POST",
                    headers: { "content-type": "text/plain" },
                    body: "{}",
                });
                expectProblem(res, 415, { code: "SPK2005" });
            });

            test("body over the limit is 413", async () => {
                const res = await target.request("/users", {
                    method: "POST",
                    headers: JSON_BODY,
                    body: JSON.stringify({ name: "x".repeat(2000), age: 1 }),
                });
                expectProblem(res, 413, { code: "SPK2006" });
            });
        });

        describe("undeclared fields", () => {
            const post = (body: string) => target.request("/schema/body", { method: "POST", headers: JSON_BODY, body });

            test("unknown body fields are dropped, at every depth", async () => {
                const res = await post(
                    JSON.stringify({
                        name: "Ada",
                        role: "admin",
                        address: { city: "London", isAdmin: true },
                        links: [{ url: "https://a.example", trusted: true }],
                        tags: ["x"],
                    }),
                );
                expectJson(res, 200, {
                    keys: ["name", "address", "links", "tags"],
                    body: { name: "Ada", address: { city: "London" }, links: [{ url: "https://a.example" }], tags: ["x"] },
                    prototype: true,
                });
            });

            test("absent optional fields stay absent", async () => {
                expectJson(await post(JSON.stringify({ tags: ["x"], name: "Ada" })), 200, {
                    keys: ["name", "tags"],
                    body: { name: "Ada", tags: ["x"] },
                    prototype: true,
                });
            });

            test("a __proto__ key in the body is dropped like any unknown field", async () => {
                expectJson(await post('{"name":"Ada","__proto__":{"isAdmin":true}}'), 200, {
                    keys: ["name"],
                    body: { name: "Ada" },
                    prototype: true,
                });
            });

            const PUBLIC = { id: 1, name: "Ada", address: { city: "London" }, roles: [{ name: "admin" }, { name: "author" }] };

            test("the response keeps only the fields of its schema", async () => {
                const res = await target.request("/schema/entity");
                expectJson(res, 200, PUBLIC);
                expect(res.text).not.toContain("argon2id");
                expect(res.text).not.toContain("private road");
            });

            test("async handlers are projected the same way", async () => {
                expectJson(await target.request("/schema/entity-async"), 200, PUBLIC);
            });

            test("interceptors receive the projected value", async () => {
                expectJson(await target.request("/schema/entity-wrapped"), 200, { data: PUBLIC });
            });

            test("a Response is sent as it is", async () => {
                expectJson(await target.request("/schema/entity-raw"), 200, { raw: true });
            });

            test("a value that does not match the response schema is a 500 naming the route and the path", async () => {
                const problem = expectProblem(await target.request("/schema/mismatch"), 500, { code: "SPK5001" });
                expect(problem.detail).toContain("GET /schema/mismatch (SchemaController.mismatch)");
                expect(problem.detail).toContain("$.roles must be an array, got string");
            });
        });

        describe("errors", () => {
            test("unexpected error is 500 without stack", async () => {
                const problem = expectProblem(await target.request("/boom"), 500, { code: "SPK5000" });
                expect(problem.detail).toBe("database password is hunter2");
                expect(problem.stack).toBeUndefined();
            });

            test("unexpected async error is 500", async () => {
                expectProblem(await target.request("/boom-async"), 500, { code: "SPK5000", detail: "async failure" });
            });

            test("HttpError with code and extensions", async () => {
                const problem = expectProblem(await target.request("/http-error"), 409, {
                    title: "Conflict",
                    detail: "Already exists.",
                    code: "USER_EXISTS",
                    field: "email",
                });
                expect(problem.title).toBe("Conflict");
            });

            test("HttpError from a handler", async () => {
                expectProblem(await target.request("/users/0"), 404, { detail: "User 0 not found." });
            });

            test("onError maps errors", async () => {
                expectProblem(await target.request("/mapped"), 409, { detail: "Mapped by onError." });
            });
        });

        describe("guards and interceptors", () => {
            test("a guard can throw its own HttpError", async () => {
                expectProblem(await target.request("/admin/me"), 401, { code: "NO_TOKEN" });
            });

            test("a guard returning false is 403", async () => {
                expectProblem(await target.request("/admin/me", { headers: { authorization: "Bearer guest" } }), 403, {
                    code: "SPK2007",
                });
            });

            test("guard state reaches the handler, interceptors run app then controller", async () => {
                expectJson(await target.request("/admin/me", { headers: { authorization: "Bearer admin" } }), 200, {
                    user: "admin",
                    order: ["app", "controller"],
                });
            });

            test("async guard", async () => {
                const auth = { authorization: "Bearer admin" };
                expectJson(await target.request("/admin/async-guard", { headers: auth }), 200, { ok: true });
                expectProblem(await target.request("/admin/async-guard?deny=1", { headers: auth }), 403, {
                    code: "SPK2007",
                });
            });

            test("route interceptors transform the result and set headers", async () => {
                const res = await target.request("/admin/wrapped", { headers: { authorization: "Bearer admin" } });
                expectJson(res, 200, { data: { value: 42 } });
                expect(res.headers.get("x-intercepted")).toBe("1");
            });
        });
    });
}
