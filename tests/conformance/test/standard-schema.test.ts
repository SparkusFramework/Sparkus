// Standard Schema beyond HTTP behavior: startup checks and OpenAPI from a library's JSON Schema.
import { expect, test } from "bun:test";
import { Controller, Get, Post, createApp, type Ctx } from "sparkus";
import { z } from "zod";

const GetItem = {
    params: z.object({ id: z.coerce.number().int().min(1) }),
    query: z.object({ q: z.string().optional(), limit: z.coerce.number().int() }),
    response: z.object({ id: z.number(), name: z.string() }),
};
const CreateItem = { body: z.object({ name: z.string().min(1) }), status: 201 };

@Controller("/items")
class Items {
    @Get("/:id", GetItem)
    get(ctx: Ctx<typeof GetItem>) {
        return { id: ctx.params.id, name: "item" };
    }

    @Post("", CreateItem)
    create(ctx: Ctx<typeof CreateItem>) {
        return ctx.body;
    }
}

test("OpenAPI uses the library's JSON Schema (Standard JSON Schema)", async () => {
    const app = createApp({ controllers: [Items] });
    await app.init();
    const doc = app.openapi() as any;

    const get = doc.paths["/items/{id}"].get;
    expect(get.parameters).toEqual([
        { name: "id", in: "path", required: true, schema: expect.objectContaining({ type: "integer", minimum: 1 }) },
        { name: "q", in: "query", required: false, schema: { type: "string" } },
        { name: "limit", in: "query", required: true, schema: expect.objectContaining({ type: "integer" }) },
    ]);
    expect(get.responses["200"].content["application/json"].schema).toMatchObject({
        type: "object",
        properties: { id: { type: "number" }, name: { type: "string" } },
        required: ["id", "name"],
    });
    const body = doc.paths["/items"].post.requestBody.content["application/json"].schema;
    expect(body).toMatchObject({ type: "object", properties: { name: { type: "string", minLength: 1 } } });
    expect(body.$schema).toBeUndefined();
});

test("a Standard Schema without JSON Schema support is documented as any value", async () => {
    const opaque = {
        "~standard": { version: 1, vendor: "custom", validate: (value: unknown) => ({ value: value as { n: number } }) },
    } as const;
    const Opaque = { body: opaque };

    @Controller()
    class Custom {
        @Post("/custom", Opaque)
        create(ctx: Ctx<typeof Opaque>) {
            return ctx.body;
        }
    }
    const app = createApp({ controllers: [Custom] });
    await app.init();
    const doc = app.openapi() as any;
    expect(doc.paths["/custom"].post.requestBody.content["application/json"].schema).toEqual({});
});

test("a broken \"~standard\" property is refused at startup", async () => {
    const Broken = { body: { "~standard": { version: 2 } } as any };

    @Controller()
    class Bad {
        @Post("/bad", Broken)
        create() {}
    }
    const app = createApp({ controllers: [Bad] });
    await expect(app.init()).rejects.toThrow(
        '[SPK1017] POST /bad (Bad.create): body schema has a "~standard" property but no Standard Schema v1 validate().',
    );
});
