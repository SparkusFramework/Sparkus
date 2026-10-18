import { describe, expect, test } from "bun:test";
import { HttpError } from "../src/errors.js";
import { Logger, parseLogLevel, type LoggerOptions } from "../src/log.js";

function capture(options: LoggerOptions = {}) {
    const lines: string[] = [];
    const log = new Logger({ format: "json", level: "trace", ...options, write: (line) => void lines.push(line) });
    return { log, lines, parsed: () => lines.map((line) => JSON.parse(line)) };
}

describe("Logger", () => {
    test("one JSON object per line: level, time, module, message, fields", () => {
        const { log, lines, parsed } = capture();
        const before = Date.now();
        log.child("users").info("User created", { userId: 42, tags: ["a"], skipped: undefined });
        expect(lines[0]).toStartWith('{"level":"info","time":');
        const [line] = parsed();
        expect(line).toEqual({ level: "info", time: line.time, module: "users", msg: "User created", userId: 42, tags: ["a"] });
        expect(line.time).toBeGreaterThanOrEqual(before);
    });

    test("child modules nest, with() binds fields", () => {
        const { log, parsed } = capture();
        log.child("users").child("repo").with({ reqId: "r1" }).with({ tenant: "t" }).warn("Slow query");
        expect(parsed()[0]).toMatchObject({ level: "warn", module: "users.repo", reqId: "r1", tenant: "t", msg: "Slow query" });
    });

    test("errors are serialized with their fields, stack and cause", () => {
        const { log, parsed } = capture();
        const cause = new Error("socket hang up");
        log.error("Payment failed", new HttpError(502, "Upstream failed.", { code: "PSP_DOWN", cause }));
        log.error("Also as a field", { err: new TypeError("bad"), orderId: 7 });
        const [first, second] = parsed();
        expect(first.err).toMatchObject({ type: "HttpError", message: "Upstream failed.", status: 502, code: "PSP_DOWN" });
        expect(first.err.stack).toContain("HttpError");
        expect(first.err.cause).toMatchObject({ type: "Error", message: "socket hang up" });
        expect(second).toMatchObject({ orderId: 7, err: { type: "TypeError", message: "bad" } });
    });

    test("a field that cannot be serialized does not break the line", () => {
        const { log, parsed } = capture();
        const loop: Record<string, unknown> = {};
        loop.self = loop;
        log.info("Weird", { loop, big: 1n, ok: true });
        expect(parsed()[0]).toMatchObject({ msg: "Weird", loop: "[unserializable]", big: "[unserializable]", ok: true });
    });

    test("levels: the threshold, per module levels (longest match), silent", () => {
        const { log, parsed } = capture({ level: "warn", modules: { db: "debug", "db.pool": "error", "sparkus": "silent" } });
        log.info("dropped");
        log.warn("kept");
        log.child("db").debug("db debug");
        log.child("db").child("migrations").debug("nested debug");
        log.child("db").child("pool").warn("pool warn dropped");
        log.child("dbx").info("not a prefix: dropped");
        log.child("sparkus").fatal("silent");
        expect(parsed().map((line) => line.msg)).toEqual(["kept", "db debug", "nested debug"]);
        expect(log.enabled("warn")).toBe(true);
        expect(log.enabled("info")).toBe(false);
        expect(log.child("db").enabled("debug")).toBe(true);
    });

    test("LOG_LEVEL: a level, and module levels", () => {
        expect(parseLogLevel("DEBUG")).toEqual({ level: "debug", modules: {} });
        expect(parseLogLevel("info, db=debug,sparkus.http=warn")).toEqual({
            level: "info",
            modules: { db: "debug", "sparkus.http": "warn" },
        });
        expect(() => parseLogLevel("verbose")).toThrow('[SPK1018] LOG_LEVEL "verbose": "verbose" is not a level.');
    });

    test("LOG_LEVEL applies only when the options give no level", () => {
        process.env.LOG_LEVEL = "error,api=debug";
        try {
            const { log, parsed } = capture({ level: undefined });
            log.warn("dropped");
            log.child("api").debug("kept");
            const explicit = capture({ level: "info" });
            explicit.log.info("explicit level wins");
            expect(parsed().map((line) => line.msg)).toEqual(["kept"]);
            expect(explicit.parsed()).toHaveLength(1);
        } finally {
            delete process.env.LOG_LEVEL;
        }
    });

    test("an invalid level in the options is refused", () => {
        expect(() => new Logger({ level: "loud" as any })).toThrow('[SPK1019] logger.level "loud" is not a level.');
    });

    test("pretty format: time, level, module, message, fields, stack", () => {
        const { log, lines } = capture({ format: "pretty" });
        log.child("users").info("User created", { userId: 42, name: "Ada Lovelace" });
        log.error("Boom", new Error("bad"));
        expect(lines[0]).toMatch(/^\d\d:\d\d:\d\d\.\d{3} INFO  users User created userId=42 name="Ada Lovelace"$/);
        expect(lines[1]).toContain('ERROR Boom err="Error: bad"\n    Error: bad');
    });

    test("a throwing destination never breaks the caller", () => {
        const log = new Logger({
            level: "info",
            write: () => {
                throw new Error("disk full");
            },
        });
        expect(() => log.info("still fine")).not.toThrow();
    });
});

describe("Logger edge cases", () => {
    test("module names in LOG_LEVEL keep their case; an empty one is refused", () => {
        expect(parseLogLevel("INFO,UserService=DEBUG")).toEqual({ level: "info", modules: { UserService: "debug" } });
        expect(() => parseLogLevel("info,=debug")).toThrow('"=debug" names no module');
    });

    test("anything that is not an object of fields is logged as err: a catch variable, a string", () => {
        const { log, parsed } = capture();
        try {
            throw "plain string";
        } catch (error) {
            log.error("Caught", error);
        }
        log.warn("Array", [1, 2]);
        expect(parsed()).toEqual([
            expect.objectContaining({ msg: "Caught", err: "plain string" }),
            expect.objectContaining({ msg: "Array", err: [1, 2] }),
        ]);
    });
});
