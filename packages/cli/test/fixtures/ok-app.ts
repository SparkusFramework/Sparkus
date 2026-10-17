import { Controller, Get, Post, createApp, t, type Ctx } from "sparkus";

const Create = { body: t.object({ name: t.string() }), status: 201 };

@Controller("/items")
class Items {
    @Get("/:id")
    get(ctx: Ctx) {
        return ctx.params;
    }

    @Post("", Create)
    create(ctx: Ctx<typeof Create>) {
        return ctx.body;
    }
}

export default createApp({ controllers: [Items] });
