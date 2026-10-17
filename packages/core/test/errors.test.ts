import { describe, expect, test } from "bun:test";
import {
    ErrorCode,
    HttpError,
    renderHttpError,
    renderMethodNotAllowed,
    renderRouteNotFound,
} from "../src/errors.js";

const PATHS = ["/", "/nope", '/a"b\c', "/caf%C3%A9/é/\u2028", "/x?y"];

describe("precomputed error rendering", () => {
    test("404 is byte for byte the HttpError rendering", () => {
        for (const path of PATHS) {
            const expected = renderHttpError(
                new HttpError(404, `No route matches GET ${path}.`, { code: ErrorCode.RouteNotFound }),
            );
            expect(renderRouteNotFound("GET", path)).toEqual(expected);
        }
    });

    test("404 with a development suggestion is byte for byte the HttpError rendering", () => {
        const expected = renderHttpError(
            new HttpError(404, "No route matches GET /user/1. Did you mean GET /users/:id?", { code: ErrorCode.RouteNotFound }),
        );
        expect(renderRouteNotFound("GET", "/user/1", "GET /users/:id")).toEqual(expected);
    });

    test("405 is byte for byte the HttpError rendering, Allow header included", () => {
        for (const path of PATHS) {
            const allow = "GET, HEAD";
            const expected = renderHttpError(
                new HttpError(405, `${path} does not accept DELETE. Allowed: ${allow}.`, {
                    code: ErrorCode.MethodNotAllowed,
                    headers: { allow },
                }),
            );
            const rendered = renderMethodNotAllowed("DELETE", path, allow);
            expect(rendered).toEqual(expected);
            expect(Object.keys(rendered.headers)).toEqual(Object.keys(expected.headers));
        }
    });
});

describe("HttpError stack traces", () => {
    test("a 4xx has none, a 5xx keeps it, and Error.stackTraceLimit is restored", () => {
        const limit = Error.stackTraceLimit;
        const client = new HttpError(404, "missing");
        expect(Error.stackTraceLimit).toBe(limit);
        expect(client.stack ?? "").not.toContain("errors.test");
        expect(client).toBeInstanceOf(Error);
        expect(client.message).toBe("missing");

        const server = new HttpError(503, "down");
        expect(Error.stackTraceLimit).toBe(limit);
        expect(server.stack).toContain("errors.test");
    });
});
