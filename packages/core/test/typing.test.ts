import { expect, test } from "bun:test";
import { Controller, Get, Post, UseGuards, t, type Ctx, type Guard } from "../src/index.js";

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

interface AuthState {
    user: { name: string };
}

class Auth implements Guard {
    canActivate(ctx: Ctx) {
        ctx.state.user = { name: "Ada" };
        return true;
    }
}

const CreatePost = { body: t.object({ title: t.string() }) };

@Controller("/posts")
@UseGuards(Auth)
class WithState {
    @Post("", CreatePost)
    create(ctx: Ctx<typeof CreatePost, AuthState>) {
        const name: string = ctx.state.user.name;
        // @ts-expect-error state is typed
        const wrong: number = ctx.state.user.name;
        return { title: ctx.body.title, by: name, wrong };
    }

    @Get("/untyped")
    untyped(ctx: Ctx) {
        const user: unknown = ctx.state.user;
        return { user };
    }
}

test("the second Ctx parameter types state", () => expect(WithState).toBeDefined());

const Nullable = {
    body: t.object({ nick: t.nullable(t.string()), note: t.optional(t.nullable(t.string())) }),
    response: t.object({ nick: t.nullable(t.string()) }),
};

@Controller("/nullable")
class WithNullable {
    @Post("", Nullable)
    create(ctx: Ctx<typeof Nullable>) {
        const nick: string | null = ctx.body.nick;
        const note: string | null | undefined = ctx.body.note;
        // @ts-expect-error nick may be null
        const wrong: string = ctx.body.nick;
        return { nick: note === undefined ? nick : wrong };
    }

    // @ts-expect-error nick may be null but not undefined
    @Post("/broken", Nullable)
    broken() {
        return { nick: undefined };
    }
}

test("t.nullable types T | null", () => expect(WithNullable).toBeDefined());
