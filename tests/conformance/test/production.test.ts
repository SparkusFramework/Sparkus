// Production options, one suite, four targets: CORS, security headers, request ids, request
// logs, health probes, timeouts, telemetry. Any difference between engines is a bug.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SECURITY_HEADERS } from "sparkus";
import { ORIGIN, aborted, durations, productionLogs, spans } from "../src/production.js";
import { inMemory, inProcess, realNode, type Reply, type Target } from "./targets.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JSON_BODY = { "content-type": "application/json" };

/** Waits for something another part of the process does after the response (Node logs on "close"). */
async function eventually<T>(find: () => T | undefined): Promise<T> {
    for (let i = 0; i < 50; i++) {
        const found = find();
        if (found !== undefined) return found;
        await Bun.sleep(10);
    }
    throw new Error("not found in time");
}

function expectSecurityHeaders(res: Reply) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers.get(name)).toBe(name === "x-frame-options" ? "SAMEORIGIN" : value);
    }
}

const targets: Array<[string, () => Promise<Target>]> = [
    ["in-memory", () => inMemory("production")],
    ["bun engine", () => inProcess("bun", "production")],
    ["node engine in Bun", () => inProcess("node", "production")],
    ["node engine in Node", () => realNode("production")],
];

let unique = 0;
const id = (label: string) => `${label.replace(/\W+/g, "-")}-${++unique}`;

for (const [label, start] of targets) {
    describe(`production: ${label}`, () => {
        let target: Target;
        beforeAll(async () => {
            target = await start();
        });
        afterAll(() => target?.close());

        describe("security headers", () => {
            test("on a JSON response, with an override from the options", async () => {
                const res = await target.request("/items/1");
                expect(res.status).toBe(200);
                expectSecurityHeaders(res);
            });

            test("on errors: 404, 400, 500", async () => {
                for (const [path, status] of [
                    ["/nope", 404],
                    ["/items/x", 400],
                    ["/ops/boom", 500],
                ] as const) {
                    const res = await target.request(path);
                    expect(res.status).toBe(status);
                    expect(res.headers.get("content-type")).toBe("application/problem+json");
                    expectSecurityHeaders(res);
                }
            });

            test("a header set by the handler wins", async () => {
                const res = await target.request("/ops/csp");
                expect(res.headers.get("content-security-policy")).toBe("default-src 'self'");
                expect(res.headers.get("x-content-type-options")).toBe("nosniff");
            });

            test("a Response returned by the handler keeps its own headers", async () => {
                const res = await target.request("/ops/response");
                expect(res.text).toBe("own");
                expect(res.headers.get("x-frame-options")).toBe("ALLOW-FROM https://a.example");
                expect(res.headers.get("x-content-type-options")).toBe("nosniff");
            });
        });

        describe("request id", () => {
            test("generated when the client sends none, in the header and in ctx.requestId", async () => {
                const res = await target.request("/items/1");
                const header = res.headers.get("x-request-id");
                expect(header).toMatch(UUID);
                expect(res.json().requestId).toBe(header!);
            });

            test("the client's id is kept when it is a safe token", async () => {
                const res = await target.request("/items/1", { headers: { "x-request-id": "edge-7f3a:12.b_c" } });
                expect(res.headers.get("x-request-id")).toBe("edge-7f3a:12.b_c");
                expect(res.json().requestId).toBe("edge-7f3a:12.b_c");
            });

            test("an unsafe or oversized id is replaced", async () => {
                for (const unsafe of ['"><script>', "a b", "x".repeat(129)]) {
                    const res = await target.request("/items/1", { headers: { "x-request-id": unsafe } });
                    expect(res.headers.get("x-request-id")).toMatch(UUID);
                }
            });

            test("on 404 too", async () => {
                const res = await target.request("/nope", { headers: { "x-request-id": "lost-1" } });
                expect(res.status).toBe(404);
                expect(res.headers.get("x-request-id")).toBe("lost-1");
            });
        });

        describe("cors", () => {
            test("an allowed origin gets the CORS headers", async () => {
                const res = await target.request("/items/1", { headers: { origin: ORIGIN } });
                expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
                expect(res.headers.get("access-control-allow-credentials")).toBe("true");
                expect(res.headers.get("access-control-expose-headers")).toBe("x-total, x-request-id");
                expect(res.headers.get("vary")).toBe("origin");
            });

            test("an origin matching a RegExp is allowed", async () => {
                const origin = "https://pr42.preview.example.com";
                const res = await target.request("/items/1", { headers: { origin } });
                expect(res.headers.get("access-control-allow-origin")).toBe(origin);
            });

            test("another origin gets none, but the response still varies by origin", async () => {
                const res = await target.request("/items/1", { headers: { origin: "https://evil.example" } });
                expect(res.status).toBe(200);
                expect(res.headers.get("access-control-allow-origin")).toBeNull();
                expect(res.headers.get("access-control-allow-credentials")).toBeNull();
                expect(res.headers.get("vary")).toBe("origin");
            });

            test("errors carry the CORS headers, so the browser can read them", async () => {
                const res = await target.request("/items/x", { headers: { origin: ORIGIN } });
                expect(res.status).toBe(400);
                expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
            });

            test("preflight: 204 with the path's methods and the asked headers", async () => {
                const res = await target.request("/items/1", {
                    method: "OPTIONS",
                    headers: {
                        origin: ORIGIN,
                        "access-control-request-method": "PUT",
                        "access-control-request-headers": "content-type, authorization",
                    },
                });
                expect(res.status).toBe(204);
                expect(res.text).toBe("");
                expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
                expect(res.headers.get("access-control-allow-methods")).toBe("GET, HEAD, PUT");
                expect(res.headers.get("access-control-allow-headers")).toBe("content-type, authorization");
                expect(res.headers.get("access-control-max-age")).toBe("600");
                expect(res.headers.get("x-request-id")).toMatch(UUID);
            });

            test("preflight from another origin: 204 without permission", async () => {
                const res = await target.request("/items/1", {
                    method: "OPTIONS",
                    headers: { origin: "https://evil.example", "access-control-request-method": "PUT" },
                });
                expect(res.status).toBe(204);
                expect(res.headers.get("access-control-allow-origin")).toBeNull();
                expect(res.headers.get("access-control-allow-methods")).toBeNull();
            });

            test("preflight on an unknown path is a 404, a plain OPTIONS a 405", async () => {
                const preflight = await target.request("/nope", {
                    method: "OPTIONS",
                    headers: { origin: ORIGIN, "access-control-request-method": "GET" },
                });
                expect(preflight.status).toBe(404);
                const plain = await target.request("/items/1", { method: "OPTIONS" });
                expect(plain.status).toBe(405);
                expect(plain.headers.get("allow")).toBe("GET, HEAD, PUT");
            });
        });

        describe("schemas: enum and default", () => {
            test("query defaults fill absent values", async () => {
                const body = (await target.request("/items/7")).json();
                expect(body).toMatchObject({ id: 7, sort: "asc", page: 1 });
            });

            test("given values are converted and checked", async () => {
                expect((await target.request("/items/7?sort=desc&page=3")).json()).toMatchObject({ sort: "desc", page: 3 });
                const res = await target.request("/items/7?sort=up");
                expect(res.status).toBe(400);
                expect(res.json().detail).toBe('Invalid query parameter "sort": must be one of "asc", "desc".');
            });

            test("body enums", async () => {
                const ok = await target.request("/items", { method: "POST", headers: JSON_BODY, body: '{"name":"a","tags":["sale"]}' });
                expect(ok.status).toBe(201);
                const bad = await target.request("/items", { method: "POST", headers: JSON_BODY, body: '{"name":"a","tags":["old"]}' });
                expect(bad.status).toBe(400);
                expect(bad.json().issues).toEqual([{ path: "$.tags[0]", message: 'must be one of "new", "sale"' }]);
            });

            test("a route's own body limit", async () => {
                const body = JSON.stringify({ name: "x".repeat(80), tags: [] });
                const res = await target.request("/items", { method: "POST", headers: JSON_BODY, body });
                expect(res.status).toBe(413);
                expect(res.json().detail).toBe("Request body exceeds the limit of 64 bytes.");
            });
        });

        describe("timeouts", () => {
            test("a request over its timeout answers 503 and aborts ctx.signal", async () => {
                aborted.reason = undefined;
                const started = performance.now();
                const res = await target.request("/ops/slow");
                expect(performance.now() - started).toBeLessThan(800);
                expect(res.status).toBe(503);
                expect(res.json()).toMatchObject({ code: "SPK2008", detail: "The request took longer than 50 ms and was abandoned." });
                expect(res.headers.get("x-request-id")).toMatch(UUID);
                if (target.local) {
                    const reason = await eventually(() => aborted.reason as { code?: string } | undefined);
                    expect(reason.code).toBe("SPK2008");
                }
            });

            test("a request within its timeout is untouched", async () => {
                expect((await target.request("/ops/fast")).json()).toEqual({ fast: true });
            });
        });

        describe("health", () => {
            test("liveness", async () => {
                const res = await target.request("/health");
                expect(res.status).toBe(200);
                expect(res.json()).toEqual({ status: "ok" });
                expectSecurityHeaders(res);
            });

            test("readiness runs every HealthCheck service", async () => {
                const res = await target.request("/ready");
                expect(res.status).toBe(200);
                expect(res.json()).toEqual({ status: "ok", checks: { Database: "ok" } });
            });

            test("a failing check is a 503 naming it", async () => {
                await target.request("/ops/db?up=false", { method: "PUT" });
                try {
                    const res = await target.request("/ready");
                    expect(res.status).toBe(503);
                    expect(res.headers.get("content-type")).toBe("application/problem+json");
                    expect(res.json()).toEqual({
                        type: "about:blank",
                        title: "Service Unavailable",
                        status: 503,
                        detail: "Not ready: Database failed.",
                        code: "SPK2009",
                        checks: { Database: "error: connection refused" },
                    });
                } finally {
                    await target.request("/ops/db?up=true", { method: "PUT" });
                }
            });
        });

        describe("logs and telemetry", () => {
            test("one log line per request, and ctx.log lines carry the request id", async () => {
                if (!target.local) return;
                const reqId = id(label);
                await target.request("/items/5", { headers: { "x-request-id": reqId } });
                const line = await eventually(() => productionLogs.find((log) => log.reqId === reqId && log.module === "http"));
                expect(line).toMatchObject({
                    level: "info",
                    msg: "GET /items/5 200",
                    method: "GET",
                    path: "/items/5",
                    route: "/items/:id",
                    status: 200,
                });
                expect(line.ms).toBeNumber();
                expect(line.time).toBeNumber();
                const own = productionLogs.find((log) => log.reqId === reqId && log.msg === "Item read");
                expect(own).toMatchObject({ level: "info", id: 5 });
            });

            test("unrouted requests are logged without a route", async () => {
                if (!target.local) return;
                const reqId = id(label);
                await target.request("/nope", { headers: { "x-request-id": reqId } });
                const line = await eventually(() => productionLogs.find((log) => log.reqId === reqId && log.module === "http"));
                expect(line).toMatchObject({ msg: "GET /nope 404", status: 404 });
                expect(line.route).toBeUndefined();
            });

            test("a server span per request, named after the route, child of the extracted context", async () => {
                if (!target.local) return;
                const parent = id(label);
                await target.request("/items/9?sort=desc", { headers: { traceparent: parent, "user-agent": "probe/1" } });
                const span = await eventually(() => spans.find((s) => s.parent === parent && s.ended));
                expect(span.name).toBe("GET /items/:id");
                expect(span.kind).toBe(1);
                expect(span.attributes).toEqual({
                    "http.request.method": "GET",
                    "url.path": "/items/9",
                    "url.scheme": "http",
                    "http.route": "/items/:id",
                    "user_agent.original": "probe/1",
                    "http.response.status_code": 200,
                });
                expect(span.status).toBeUndefined();
            });

            test("a 500 marks the span as failed, records the exception and logs it with the request id", async () => {
                if (!target.local) return;
                const parent = id(label);
                const res = await target.request("/ops/boom", { headers: { traceparent: parent } });
                const reqId = res.headers.get("x-request-id");
                const span = await eventually(() => spans.find((s) => s.parent === parent && s.ended));
                expect(span.status).toEqual({ code: 2 });
                expect(span.attributes["error.type"]).toBe("500");
                expect((span.exceptions[0] as Error).message).toBe("kaboom");
                const error = productionLogs.find((log) => log.reqId === reqId && log.level === "error");
                expect(error).toMatchObject({ module: "sparkus", msg: "Unhandled error in GET /ops/boom" });
                expect(error!.err).toMatchObject({ type: "Error", message: "kaboom" });
            });

            test("request duration histogram with the semantic convention attributes", async () => {
                if (!target.local) return;
                const before = durations.length;
                await target.request("/ops/fast");
                const measure = await eventually(() =>
                    durations.slice(before).find((d) => d.attributes?.["http.route"] === "/ops/fast"),
                );
                expect(measure.name).toBe("http.server.request.duration");
                expect(measure.value).toBeGreaterThan(0.004);
                expect(measure.value).toBeLessThan(5);
                expect(measure.attributes).toEqual({
                    "http.request.method": "GET",
                    "http.response.status_code": 200,
                    "url.scheme": "http",
                    "http.route": "/ops/fast",
                });
            });
        });
    });
}
