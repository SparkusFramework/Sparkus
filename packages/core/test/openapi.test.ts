import { expect, test } from "bun:test";
import { toJsonSchema } from "../src/openapi.js";
import { Controller, Get, Post, createApp, t, type Ctx } from "../src/index.js";

const GetUser = {
    params: t.object({ id: t.integer({ min: 1 }) }),
    query: t.object({ fields: t.optional(t.string()) }),
};
const CreateUser = {
    body: t.object({ name: t.string({ min: 1, max: 100 }), tags: t.optional(t.array(t.string(), { max: 5 })) }),
    status: 201,
};

@Controller("/users")
class Users {
    @Get("/:id", GetUser)
    get(ctx: Ctx<typeof GetUser>) {
        return ctx.params;
    }

    @Post("", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        return ctx.body;
    }

    @Get("/:id/raw")
    raw(ctx: Ctx) {
        return ctx.params;
    }
}

test("openapi() describes paths, parameters, bodies and errors", async () => {
    const app = createApp({ controllers: [Users] });
    await app.init();
    const doc = app.openapi({ title: "Users", version: "2.0.0" }) as any;

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info).toEqual({ title: "Users", version: "2.0.0" });
    expect(Object.keys(doc.paths)).toEqual(["/users/{id}", "/users", "/users/{id}/raw"]);

    expect(doc.paths["/users/{id}"].get).toMatchObject({
        operationId: "Users.get",
        parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
            { name: "fields", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
    });
    expect(doc.paths["/users"].post.requestBody.content["application/json"].schema).toEqual({
        type: "object",
        properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            tags: { type: "array", items: { type: "string" }, maxItems: 5 },
        },
        required: ["name"],
    });
    expect(doc.paths["/users"].post.responses["201"].description).toBe("Created");
    expect(doc.paths["/users/{id}/raw"].get.parameters).toEqual([
        { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
    expect(doc.paths["/users"].post.responses.default.content["application/problem+json"]).toBeDefined();
});

test("a response schema documents the success body", async () => {
    const Item = { response: t.object({ id: t.integer() }) };
    @Controller()
    class Items {
        @Get("/item", Item)
        get() {
            return { id: 1 };
        }
    }
    const app = createApp({ controllers: [Items] });
    await app.init();
    const doc = app.openapi() as any;
    expect(doc.paths["/item"].get.responses["200"].content["application/json"].schema).toEqual({
        type: "object",
        properties: { id: { type: "integer" } },
        required: ["id"],
    });
});

test("nullable schemas are type lists (JSON Schema 2020-12)", () => {
    expect(toJsonSchema(t.nullable(t.string({ min: 1 })))).toEqual({ type: ["string", "null"], minLength: 1 });
    expect(toJsonSchema(t.object({ manager: t.nullable(t.object({ name: t.string() })) }))).toEqual({
        type: "object",
        properties: {
            manager: { type: ["object", "null"], properties: { name: { type: "string" } }, required: ["name"] },
        },
        required: ["manager"],
    });
});
