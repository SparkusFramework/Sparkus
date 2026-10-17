import { describe, expect, test } from "bun:test";
import {
    Controller,
    Get,
    Post,
    UseGuards,
    createApp,
    inject,
    t,
    type Ctx,
} from "../src/index.js";
import { isJsonContentType } from "../src/engine.js";

describe("startup checks", () => {
    test("dependency cycle through a controller", async () => {
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
        expect(createApp({ controllers: [C] }).init()).rejects.toThrow("Dependency cycle: A -> B -> A, reached from C.");
    });

    test("duplicate route across controllers", async () => {
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
        expect(createApp({ controllers: [One, Two] }).init()).rejects.toThrow(
            "[SPK1003] Route GET /x is declared twice: One.a and Two.b. Remove one, or change its method or path.",
        );
    });

    test("missing @Controller", async () => {
        class Plain {}
        expect(createApp({ controllers: [Plain] }).init()).rejects.toThrow("[SPK1004]");
    });

    test("invalid paths", async () => {
        @Controller()
        class Wild {
            @Get("/files/*")
            a() {}
        }
        @Controller()
        class Double {
            @Get("/a/:id/b/:id")
            a() {}
        }
        expect(createApp({ controllers: [Wild] }).init()).rejects.toThrow("[SPK1014]");
        expect(createApp({ controllers: [Double] }).init()).rejects.toThrow("uses the parameter \":id\" twice");
    });

    test("a class without canActivate is not a guard", async () => {
        class NotAGuard {}
        @Controller()
        @UseGuards(NotAGuard as any)
        class Guarded {
            @Get("/")
            a() {}
        }
        expect(createApp({ controllers: [Guarded] }).init()).rejects.toThrow("[SPK1008]");
    });

    test("listen() without an engine is SPK1007", async () => {
        @Controller()
        class Empty {}
        expect(createApp({ controllers: [Empty] }).listen()).rejects.toThrow("[SPK1007]");
    });

    test("fetch() before init() is SPK1012", async () => {
        @Controller()
        class Empty {}
        expect(createApp({ controllers: [Empty] }).fetch(new Request("http://x/"))).rejects.toThrow("[SPK1012]");
    });
});

describe("app", () => {
    test("routes are listed for tooling", async () => {
        const Body = { body: t.object({ name: t.string() }), status: 201 };
        const allow = () => true;
        @Controller("/users")
        class Users {
            @Get("/:id")
            get(ctx: Ctx) {
                return ctx.params;
            }
            @Post("", Body)
            @UseGuards(allow)
            create(ctx: Ctx<typeof Body>) {
                return ctx.body;
            }
        }
        const app = createApp({ controllers: [Users] });
        await app.init();
        expect(app.routes).toEqual([
            { method: "GET", path: "/users/:id", handler: "Users.get", status: 200, body: false, guards: 0, interceptors: 0 },
            { method: "POST", path: "/users", handler: "Users.create", status: 201, body: true, guards: 1, interceptors: 0 },
        ]);
    });

    test("500 hides the message when exposeErrors is off", async () => {
        @Controller()
        class Boom {
            @Get("/")
            boom() {
                throw new Error("secret");
            }
        }
        const logged: unknown[] = [];
        const app = createApp({ controllers: [Boom], exposeErrors: false, logger: { error: (_m, e) => logged.push(e) } });
        await app.init();
        const res = await app.fetch(new Request("http://x/"));
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({
            type: "about:blank",
            title: "Internal Server Error",
            status: 500,
            code: "SPK5000",
        });
        expect(logged).toHaveLength(1);
    });

    test("a route without guards or interceptors runs its handler directly", async () => {
        @Controller()
        class Plain {
            @Get("/")
            hello() {
                return 1;
            }
        }
        const app = createApp({ controllers: [Plain] });
        await app.init();
        const route = (app as any).runtime.routes[0];
        // The bound handler itself, not a wrapper.
        expect(route.run.name).toStartWith("bound");
    });
});

test("isJsonContentType", () => {
    for (const ok of ["application/json", "application/json; charset=utf-8", "Application/JSON", "application/problem+json"]) {
        expect(isJsonContentType(ok)).toBe(true);
    }
    for (const no of [undefined, null, "", "text/plain", "application/jsonx", "text/json+xml"]) {
        expect(isJsonContentType(no)).toBe(false);
    }
});

test("a controller listed twice is named as such", async () => {
    @Controller("/x")
    class Twice {
        @Get("/")
        a() {}
    }
    expect(createApp({ controllers: [Twice, Twice] }).init()).rejects.toThrow(
        '[SPK1003] Twice is listed twice in "controllers". List each controller once.',
    );
});
