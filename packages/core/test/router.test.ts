import { describe, expect, test } from "bun:test";
import { Router } from "../src/engine.js";

function router(routes: Array<[string, string]>) {
    const r = new Router<string>();
    for (const [method, path] of routes) r.add(method, path, `${method} ${path}`);
    return r;
}

describe("Router", () => {
    const r = router([
        ["GET", "/"],
        ["GET", "/users"],
        ["GET", "/users/me"],
        ["GET", "/users/:id"],
        ["DELETE", "/users/:id"],
        ["GET", "/users/:id/posts/:postId"],
        ["GET", "/files/static/meta"],
        ["GET", "/files/:name/raw"],
        ["POST", "/a/:x/b"],
        ["GET", "/a/:x/:y"],
    ]);

    test("static paths return a shared, preallocated match", () => {
        const match = r.find("GET", "/users")!;
        expect(match.handler).toBe("GET /users");
        expect(match.params).toEqual({});
        expect(r.find("GET", "/users")).toBe(match);
    });

    test("parameters, in a fixed shape", () => {
        expect(r.find("GET", "/users/1/posts/2")).toEqual({
            handler: "GET /users/:id/posts/:postId",
            params: { id: "1", postId: "2" },
        });
        expect(Object.keys(r.find("GET", "/users/9/posts/8")!.params)).toEqual(["id", "postId"]);
    });

    test("static wins, other methods fall back to parameters", () => {
        expect(r.find("GET", "/users/me")!.handler).toBe("GET /users/me");
        expect(r.find("DELETE", "/users/me")).toEqual({ handler: "DELETE /users/:id", params: { id: "me" } });
    });

    test("backtracking across static and parameter branches", () => {
        expect(r.find("GET", "/files/static/raw")).toEqual({ handler: "GET /files/:name/raw", params: { name: "static" } });
        expect(r.find("GET", "/a/1/b")).toEqual({ handler: "GET /a/:x/:y", params: { x: "1", y: "b" } });
        expect(r.find("POST", "/a/1/b")).toEqual({ handler: "POST /a/:x/b", params: { x: "1" } });
    });

    test("decoding, and malformed escapes left as is", () => {
        expect(r.find("GET", "/users/a%2Fb")!.params).toEqual({ id: "a/b" });
        expect(r.find("GET", "/users/%E0%A4%A")!.params).toEqual({ id: "%E0%A4%A" });
    });

    test("HEAD falls back to GET", () => {
        expect(r.find("HEAD", "/users")!.handler).toBe("GET /users");
        expect(r.find("HEAD", "/users/3")!.handler).toBe("GET /users/:id");
    });

    test("misses: empty segments, trailing slash, case", () => {
        expect(r.find("GET", "/users/")).toBeNull();
        expect(r.find("GET", "/users//posts/1")).toBeNull();
        expect(r.find("GET", "/USERS")).toBeNull();
        expect(r.find("GET", "/nope")).toBeNull();
    });

    test("allowed() lists methods for 405, null for 404", () => {
        expect(r.allowed("/users/3")).toBe("GET, HEAD, DELETE");
        expect(r.allowed("/users/me")).toBe("GET, HEAD, DELETE");
        expect(r.allowed("/nope")).toBeNull();
    });

    test("many static children switch to a Map", () => {
        const big = router(Array.from({ length: 20 }, (_, i) => ["GET", `/r/:id/s${i}`] as [string, string]));
        expect(big.find("GET", "/r/1/s17")).toEqual({ handler: "GET /r/:id/s17", params: { id: "1" } });
        expect(big.find("GET", "/r/1/s20")).toBeNull();
    });

    test("conflicting parameter names and duplicates are startup errors", () => {
        expect(() => router([["GET", "/u/:id"], ["GET", "/u/:userId/x"]])).toThrow("[SPK1006]");
        expect(() => router([["GET", "/u/:id"], ["GET", "/u/:id"]])).toThrow("[SPK1003]");
    });
});
