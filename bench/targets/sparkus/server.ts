// Sparkus v1. Same file for both engines: "auto" picks Bun.serve under Bun and
// node:http under Node (Node runs the tsc output in dist/).
import { Controller, Get, Post, createApp, inject, t, type Ctx } from "sparkus";

// Same values as ../shared.js, inlined because Node runs the compiled copy from dist/.
const PORT = Number(process.env.PORT ?? 3000);
const HOST = "127.0.0.1";

// Records as a database would return them: the list route's schema keeps 4 of their 6 fields.
const USERS = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: "User " + (i + 1),
    email: `user${i + 1}@example.com`,
    admin: i === 0,
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$" + "x".repeat(43),
    createdAt: "2026-10-17T00:00:00.000Z",
}));

class UserService {
    find(id: string) {
        return { id, name: "User " + id };
    }

    list() {
        return USERS;
    }
}

// Response schemas, as Fastify's target declares them: the payload is typed and filtered.
const Hello = { response: t.object({ hello: t.string() }) };

const GetUser = {
    response: t.object({ id: t.string(), name: t.string(), fields: t.optional(t.string()) }),
};

const ListUsers = {
    response: t.array(t.object({ id: t.integer(), name: t.string(), email: t.string(), admin: t.boolean() })),
};

const CreateUser = {
    body: t.object({
        name: t.string({ min: 1, max: 100 }),
        age: t.integer({ min: 0, max: 150 }),
    }),
    response: t.object({ id: t.integer(), name: t.string(), age: t.integer() }),
    status: 201,
};

@Controller()
class HelloController {
    @Get("/", Hello)
    hello() {
        return { hello: "world" };
    }
}

@Controller("/users")
class UserController {
    private readonly users = inject(UserService);

    @Get("", ListUsers)
    list() {
        return this.users.list();
    }

    @Get("/:id", GetUser)
    get(ctx: Ctx<typeof GetUser>) {
        return { ...this.users.find(ctx.params.id!), fields: ctx.query.fields };
    }

    @Post("", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        return { id: 1, name: ctx.body.name, age: ctx.body.age };
    }
}

await createApp({ controllers: [HelloController, UserController] }).listen({ port: PORT, hostname: HOST });
