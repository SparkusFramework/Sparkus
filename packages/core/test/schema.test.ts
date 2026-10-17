import { describe, expect, test } from "bun:test";
import { compileParser, compileProjector, compileValidator, t, type Issue } from "../src/schema.js";

const invalid = (issue: Issue) => Object.assign(new Error(`${issue.path} ${issue.message}`), { issue });
const WHERE = "POST /x (X.y)";

const Profile = t.object({
    name: t.string({ min: 1 }),
    age: t.optional(t.integer()),
    address: t.optional(t.object({ city: t.string() })),
    links: t.array(t.object({ url: t.string() })),
    tags: t.array(t.string()),
});

describe("compileValidator", () => {
    const validate = compileValidator(Profile);

    test("reports the first issue with its path", () => {
        expect(validate({ name: "Ada", links: [{ url: 1 }], tags: [] })).toEqual({
            path: "$.links[0].url",
            message: "must be a string",
        });
        expect(validate({ name: "Ada", links: [], tags: [], extra: true })).toBeNull();
    });
});

describe("compileParser", () => {
    const parse = compileParser(Profile, invalid, WHERE);

    test("keeps only the declared fields, at every depth, in declaration order", () => {
        const input = {
            tags: ["a"],
            links: [{ url: "u", rel: "me" }],
            role: "admin",
            address: { zip: "000", city: "London" },
            name: "Ada",
        };
        const body = parse(input);
        expect(body).toEqual({ name: "Ada", address: { city: "London" }, links: [{ url: "u" }], tags: ["a"] });
        expect(Object.keys(body as object)).toEqual(["name", "address", "links", "tags"]);
        expect(input.role).toBe("admin");
    });

    test("absent optional fields are not set", () => {
        const body = parse({ name: "Ada", links: [], tags: [] }) as Record<string, unknown>;
        expect("age" in body).toBe(false);
        expect("address" in body).toBe(false);
    });

    test("arrays of scalars are kept, arrays of objects are copied", () => {
        const input = { name: "Ada", links: [{ url: "u" }], tags: ["a"] };
        const body = parse(input) as typeof input;
        expect(body.tags).toBe(input.tags);
        expect(body.links).not.toBe(input.links);
    });

    test("throws the first issue through invalid()", () => {
        expect(() => parse({ name: "", links: [], tags: [] })).toThrow("$.name must have at least 1 characters");
        expect(() => parse({ name: "Ada", links: [], tags: [], address: { city: 1 } })).toThrow("$.address.city must be a string");
        expect(() => parse(null)).toThrow("$ must be an object");
    });

    test("scalar schemas return the value itself", () => {
        expect(compileParser(t.array(t.integer()), invalid, WHERE)([1, 2])).toEqual([1, 2]);
        expect(compileParser(t.string(), invalid, WHERE)("x")).toBe("x");
    });

    test('a schema field named "__proto__" is refused at startup', () => {
        const shape = Object.defineProperty({}, "__proto__", { value: t.string(), enumerable: true });
        expect(() => compileParser(t.object(shape), invalid, WHERE)).toThrow("[SPK1017] POST /x (X.y): field \"__proto__\"");
    });
});

describe("compileProjector", () => {
    const User = t.object({
        id: t.integer(),
        nickname: t.optional(t.string()),
        address: t.optional(t.object({ city: t.string() })),
        roles: t.array(t.object({ name: t.string() })),
        tags: t.array(t.string()),
    });
    const project = compileProjector(User, WHERE)!;

    test("keeps only the declared fields", () => {
        const entity = {
            id: 1,
            passwordHash: "secret",
            address: { city: "London", street: "private" },
            roles: [{ name: "admin", grantedBy: "root" }],
            tags: ["a"],
        };
        const out = project(entity);
        expect(JSON.stringify(out)).toBe('{"id":1,"address":{"city":"London"},"roles":[{"name":"admin"}],"tags":["a"]}');
        expect((out as typeof entity).tags).toBe(entity.tags);
    });

    test("lists of objects are projected item by item", () => {
        const list = compileProjector(t.array(t.object({ id: t.integer() })), WHERE)!;
        expect(JSON.stringify(list([{ id: 1, secret: 1 }, { id: 2 }]))).toBe('[{"id":1},{"id":2}]');
    });

    test("a Response passes through", () => {
        const response = new Response("x");
        expect(project(response)).toBe(response);
    });

    test("nothing to project for scalar schemas", () => {
        expect(compileProjector(t.string(), WHERE)).toBeNull();
        expect(compileProjector(t.integer(), WHERE)).toBeNull();
    });

    test("a shape mismatch names the route and the path", () => {
        expect(() => project({ id: 1, roles: [null], tags: [] })).toThrow(
            "[SPK5001] POST /x (X.y) returned a value that does not match its response schema: $.roles[0] must be an object, got null.",
        );
        expect(() => project({ id: 1, address: [], roles: [], tags: [] })).toThrow("$.address must be an object, got an array");
        expect(() => project(undefined)).toThrow("$ must be an object, got undefined");
    });
});

describe("t.nullable", () => {
    const Profile = t.object({
        nick: t.nullable(t.string({ min: 2 })),
        manager: t.nullable(t.object({ name: t.string() })),
        note: t.optional(t.nullable(t.string())),
        scores: t.nullable(t.array(t.object({ value: t.integer() }))),
    });

    test("the parser keeps null and still copies declared fields when present", () => {
        const parse = compileParser(Profile, invalid, WHERE);
        expect(parse({ nick: null, manager: null, note: null, scores: null })).toEqual({
            nick: null,
            manager: null,
            note: null,
            scores: null,
        });
        expect(parse({ nick: "Ada", manager: { name: "Grace", extra: 1 }, scores: [{ value: 1, extra: 2 }] })).toEqual({
            nick: "Ada",
            manager: { name: "Grace" },
            scores: [{ value: 1 }],
        });
    });

    test("null stays required unless optional, and type errors say null was allowed", () => {
        const parse = compileParser(Profile, invalid, WHERE);
        expect(() => parse({ manager: null, scores: null })).toThrow("$.nick is required");
        expect(() => parse({ nick: 5, manager: null, scores: null })).toThrow("$.nick must be a string or null");
        expect(() => parse({ nick: "A", manager: null, scores: null })).toThrow("$.nick must have at least 2 characters");
        expect(() => compileParser(t.object({ a: t.string() }), invalid, WHERE)({ a: null })).toThrow("$.a must be a string");
        expect(compileValidator(Profile)({ nick: null, manager: [], scores: null })).toEqual({
            path: "$.manager",
            message: "must be an object or null",
        });
    });

    test("the projector copies null and still filters objects", () => {
        const project = compileProjector(Profile, WHERE)!;
        expect(JSON.stringify(project({ nick: null, manager: null, scores: null, secret: 1 }))).toBe(
            '{"nick":null,"manager":null,"scores":null}',
        );
        expect(JSON.stringify(project({ nick: "Ada", manager: { name: "G", salary: 1 }, scores: [] }))).toBe(
            '{"nick":"Ada","manager":{"name":"G"},"scores":[]}',
        );
        expect(() => project({ nick: null, manager: "boss", scores: null })).toThrow("$.manager must be an object or null, got string");
        expect(compileProjector(t.nullable(t.object({ id: t.integer() })), WHERE)!(null)).toBeNull();
    });
});
