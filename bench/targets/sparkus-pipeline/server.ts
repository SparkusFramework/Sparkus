// Sparkus with guards and interceptors: one route per pipeline shape, for the
// "pipe-*" scenarios. Same handler everywhere, so only the layers differ.
// Also serves the standard routes (GET /, POST /users) the bench's contract needs.
import { Controller, Get, Post, UseGuards, UseInterceptors, createApp, t, type Ctx, type Next } from "sparkus";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "127.0.0.1";

const allow = () => true;
const allowAsync = async () => true;
const pass = (_ctx: Ctx, next: Next) => next();

const CreateUser = {
    body: t.object({ name: t.string({ min: 1, max: 100 }), age: t.integer({ min: 0, max: 150 }) }),
    status: 201,
};

@Controller()
class PipelineController {
    @Get("/")
    hello() {
        return { hello: "world" };
    }

    @Post("/users", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        return { id: 1, name: ctx.body.name, age: ctx.body.age };
    }

    @Get("/p/none")
    none() {
        return { hello: "world" };
    }

    @Get("/p/guard")
    @UseGuards(allow)
    guard() {
        return { hello: "world" };
    }

    @Get("/p/guard-async")
    @UseGuards(allowAsync)
    guardAsync() {
        return { hello: "world" };
    }

    @Get("/p/interceptor")
    @UseInterceptors(pass)
    interceptor() {
        return { hello: "world" };
    }

    @Get("/p/interceptors-3")
    @UseInterceptors(pass, pass, pass)
    interceptors3() {
        return { hello: "world" };
    }

    @Get("/p/guards-3")
    @UseGuards(allow, allow, allow)
    guards3() {
        return { hello: "world" };
    }
}

await createApp({ controllers: [PipelineController] }).listen({ port: PORT, hostname: HOST });
