// Phase 0 spike, kept as a baseline: the v1 core must not be slower.
// and node:http under Node (Node runs the tsc output in dist/).
import { Controller, Get, Post, createApp, inject, t, type Ctx } from "@sparkus/spike";

// Same values as ../shared.js, inlined because Node runs the compiled copy from dist/.
const PORT = Number(process.env.PORT ?? 3000);
const HOST = "127.0.0.1";

class UserService {
    find(id: string) {
        return { id, name: "User " + id };
    }
}

const CreateUser = {
    body: t.object({
        name: t.string({ min: 1, max: 100 }),
        age: t.integer({ min: 0, max: 150 }),
    }),
    status: 201,
};

@Controller()
class HelloController {
    @Get("/")
    hello() {
        return { hello: "world" };
    }
}

@Controller("/users")
class UserController {
    users = inject(UserService);

    @Get("/:id")
    get(ctx: Ctx) {
        return { ...this.users.find(ctx.params.id!), fields: ctx.query.fields ?? null };
    }

    @Post("", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        return { id: 1, name: ctx.body.name, age: ctx.body.age };
    }
}

await createApp({ controllers: [HelloController, UserController] }).listen({ port: PORT, hostname: HOST });
