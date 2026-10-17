import { describe, expect, test } from "bun:test";
import { HttpError } from "../src/errors.js";

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
