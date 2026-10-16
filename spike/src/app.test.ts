import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Controller, Get, HttpError, Post, createApp, inject, t, type Ctx, type RunningServer } from "./index.js";

class UserService {
    find(id: string) {
        return { id, name: "User " + id };
    }
}

const CreateUser = {
    body: t.object({
        name: t.string({ min: 1, max: 100 }),
        age: t.integer({ min: 0, max: 150 }),
        tags: t.optional(t.array(t.string())),
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
        if (ctx.params.id === "0") throw new HttpError(404, "User not found");
        return { ...this.users.find(ctx.params.id!), fields: ctx.query.fields ?? null };
    }

    @Get("/:id/async")
    async getAsync(ctx: Ctx) {
        return { id: ctx.params.id, agent: ctx.header("x-agent") ?? null };
    }

    @Post("", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        // Compile-time check: body is inferred from the schema.
        const name: string = ctx.body.name;
        const tags: string[] | undefined = ctx.body.tags;
        return { id: 1, name, age: ctx.body.age, tags: tags ?? [] };
    }
}

for (const engine of ["bun", "node"] as const) {
    describe(`engine ${engine}`, () => {
        let server: RunningServer;
        let base: string;

        beforeAll(async () => {
            server = await createApp({ controllers: [HelloController, UserController], engine }).listen({
                port: 0,
                hostname: "127.0.0.1",
            });
            base = `http://127.0.0.1:${server.port}`;
        });

        afterAll(() => server.stop());

        test("static route", async () => {
            const res = await fetch(base + "/");
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ hello: "world" });
        });

        test("params, query and injected service", async () => {
            const res = await fetch(base + "/users/42?fields=name%2Cemail&x=1");
            expect(await res.json()).toEqual({ id: "42", name: "User 42", fields: "name,email" });
        });

        test("async handler and headers", async () => {
            const res = await fetch(base + "/users/7/async", { headers: { "x-agent": "claude" } });
            expect(await res.json()).toEqual({ id: "7", agent: "claude" });
        });

        test("HttpError", async () => {
            const res = await fetch(base + "/users/0");
            expect(res.status).toBe(404);
            expect(await res.json()).toEqual({ error: "User not found" });
        });

        test("validated body", async () => {
            const res = await fetch(base + "/users", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: "Ada", age: 36 }),
            });
            expect(res.status).toBe(201);
            expect(await res.json()).toEqual({ id: 1, name: "Ada", age: 36, tags: [] });
        });

        test("invalid body", async () => {
            const res = await fetch(base + "/users", {
                method: "POST",
                body: JSON.stringify({ name: "Ada", age: 3.5, tags: ["a", 2] }),
            });
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({
                error: "Bad Request",
                issues: [{ path: "$.age", message: "must be an integer" }],
            });
        });

        test("malformed JSON", async () => {
            const res = await fetch(base + "/users", { method: "POST", body: "{nope" });
            expect(res.status).toBe(400);
        });

        test("unknown route", async () => {
            const res = await fetch(base + "/nope");
            expect(res.status).toBe(404);
        });
    });
}

describe("startup checks", () => {
    test("dependency cycle is reported with its path", () => {
        class A {
            b: unknown = inject(B);
        }
        class B {
            a = inject(A);
        }
        @Controller()
        class C {
            a = inject(A);
        }
        expect(() => createApp({ controllers: [C] }).compile()).toThrow("Dependency cycle: A -> B -> A");
    });

    test("duplicate route", () => {
        @Controller("/x")
        class One {
            @Get("/")
            a() {}
        }
        @Controller("x")
        class Two {
            @Get("")
            b() {}
        }
        expect(() => createApp({ controllers: [One, Two] }).compile()).toThrow("GET /x is declared twice");
    });

    test("inject outside of construction", () => {
        expect(() => inject(UserService)).toThrow("SPK1001");
    });
});
