import { expect, test } from "bun:test";
import { Controller, Get, t, type Ctx } from "../src/index.js";

const GetPost = {
    params: t.object({ id: t.integer(), slug: t.string() }),
    query: t.object({ page: t.optional(t.integer()) }),
};

@Controller()
class Typed {
    @Get("/:id/:slug", GetPost)
    get(ctx: Ctx<typeof GetPost>) {
        const id: number = ctx.params.id;
        const slug: string = ctx.params.slug;
        const page: number | undefined = ctx.query.page;
        // @ts-expect-error id is a number
        const wrong: string = ctx.params.id;
        return { id, slug, page, wrong };
    }

    @Get("/plain/:id")
    plain(ctx: Ctx) {
        const id: string | undefined = ctx.params.id;
        return id;
    }
}

test("typed params compile", () => expect(Typed).toBeDefined());

const User = t.object({ id: t.integer(), name: t.string() });
const GetUser = { params: t.object({ id: t.integer() }), response: User };

@Controller("/users")
class WithResponse {
    @Get("/:id", GetUser)
    get(ctx: Ctx<typeof GetUser>) {
        return { id: ctx.params.id, name: "Ada" };
    }

    @Get("/:id/async", GetUser)
    async getAsync(ctx: Ctx<typeof GetUser>) {
        return { id: ctx.params.id, name: "Ada" };
    }

    // @ts-expect-error name is missing from the response
    @Get("/:id/broken", GetUser)
    broken(ctx: Ctx<typeof GetUser>) {
        return { id: ctx.params.id };
    }
}

test("response schemas type the handler's result", () => expect(WithResponse).toBeDefined());
