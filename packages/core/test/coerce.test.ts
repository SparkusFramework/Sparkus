import { describe, expect, test } from "bun:test";
import { checkSchema, compileCoercer } from "../src/coerce.js";
import { HttpError, t, type Issue } from "../src/index.js";

function issue(fn: () => unknown) {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        const e = error as HttpError;
        return { status: e.status, code: e.code, detail: e.detail, issues: e.extensions?.issues as Issue[] };
    }
    throw new Error("expected an HttpError");
}

describe("compileCoercer", () => {
    const params = compileCoercer(t.object({ id: t.integer({ min: 1 }), slug: t.string({ max: 5 }) }), "params");
    const query = compileCoercer(
        t.object({
            page: t.optional(t.integer({ min: 1, max: 100 })),
            ratio: t.optional(t.number()),
            draft: t.optional(t.boolean()),
            q: t.optional(t.string({ min: 2 })),
        }),
        "query",
    );

    test("converts and keeps a fixed shape", () => {
        expect(params({ id: "42", slug: "abc" })).toEqual({ id: 42, slug: "abc" });
        expect(query({ page: "3", ratio: "-1.5e2", draft: "true", q: "hi" })).toEqual({
            page: 3,
            ratio: -150,
            draft: true,
            q: "hi",
        });
        const empty = query({});
        expect(Object.keys(empty)).toEqual(["page", "ratio", "draft", "q"]);
        expect(empty.page).toBeUndefined();
    });

    test("ignores unknown query keys", () => {
        expect(query({ other: "x", draft: "0" })).toEqual({ page: undefined, ratio: undefined, draft: false, q: undefined });
    });

    test("rejects with a 400 naming the value", () => {
        expect(issue(() => params({ id: "4x2", slug: "a" }))).toEqual({
            status: 400,
            code: "SPK2004",
            detail: "Invalid path parameter params.id: must be an integer.",
            issues: [{ path: "params.id", message: "must be an integer" }],
        });
        expect(issue(() => params({ id: "0", slug: "a" })).issues).toEqual([{ path: "params.id", message: "must be >= 1" }]);
        expect(issue(() => params({ id: "99999999999999999999", slug: "a" })).issues[0]!.message).toBe("must be a safe integer");
        expect(issue(() => params({ id: "1", slug: "toolong" })).issues[0]!.message).toBe("must have at most 5 characters");
        expect(issue(() => query({ page: "101" })).detail).toBe("Invalid query parameter query.page: must be <= 100.");
        expect(issue(() => query({ ratio: "" })).issues[0]!.message).toBe("must be a number");
        expect(issue(() => query({ ratio: "1,5" })).issues[0]!.message).toBe("must be a number");
        expect(issue(() => query({ draft: "yes" })).issues[0]!.message).toBe('must be "true", "false", "1" or "0"');
    });
});

describe("checkSchema", () => {
    const where = "GET /users/:id (Users.get)";

    test("params must match the path exactly", () => {
        expect(() => checkSchema(t.object({ id: t.integer() }), "params", where, ["id"])).not.toThrow();
        expect(() => checkSchema(t.object({}), "params", where, ["id"])).toThrow(
            '[SPK1017] GET /users/:id (Users.get): params schema is missing "id".',
        );
        expect(() => checkSchema(t.object({ id: t.integer(), x: t.string() }), "params", where, ["id"])).toThrow(
            'has "x", which is not a parameter of the path',
        );
        expect(() => checkSchema(t.object({ id: t.optional(t.integer()) }), "params", where, ["id"])).toThrow(
            "path parameters are always present",
        );
    });

    test("only flat scalar fields", () => {
        expect(() => checkSchema(t.object({ tags: t.optional(t.array(t.string())) }), "query", where, [])).toThrow(
            'field "tags" is t.array(); only string, integer, number and boolean are supported',
        );
        expect(() => checkSchema(t.string(), "query", where, [])).toThrow("must be t.object({ ... })");
    });
});
