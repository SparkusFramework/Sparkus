import { describe, expect, test } from "bun:test";
import { Controller, Get, Logger, createApp, inject, type Ctx, type HealthCheck } from "../src/index.js";

const json = (lines: string[]) => lines.map((line) => JSON.parse(line));

@Controller()
class Hello {
    private readonly log = inject(Logger).child("hello");

    @Get("/")
    get(_ctx: Ctx) {
        this.log.info("Said hello");
        return { hello: "world" };
    }
}

describe("startup checks of the production options", () => {
    test("cors: an origin with a path or a trailing slash never matches", async () => {
        const app = createApp({ controllers: [Hello], logger: false, cors: { origin: ["https://app.example.com/"] } });
        expect(app.init()).rejects.toThrow(
            '[SPK1019] cors.origin "https://app.example.com/" never matches: browsers send an origin without a path. ' +
                'Remove the trailing slash: "https://app.example.com".',
        );
    });

    test('cors: origin "*" with credentials', async () => {
        const app = createApp({ controllers: [Hello], logger: false, cors: { origin: "*", credentials: true } });
        expect(app.init()).rejects.toThrow('[SPK1019] cors: origin "*" cannot be used with credentials: true');
    });

    test("a route already on a health path", async () => {
        @Controller("/health")
        class Mine {
            @Get()
            get() {
                return "mine";
            }
        }
        const app = createApp({ controllers: [Mine], logger: false, health: true });
        expect(app.init()).rejects.toThrow("[SPK1003] GET /health is declared by Mine.get and by the health option.");
    });

    test("route timeout and body limit must be integers >= 0", async () => {
        @Controller()
        class Bad {
            @Get("/", { timeout: -5 })
            get() {
                return 1;
            }
        }
        const app = createApp({ controllers: [Bad], logger: false });
        expect(app.init()).rejects.toThrow("[SPK1019] GET / (Bad.get): timeout -5 is not a number of milliseconds.");
    });
});

describe("logger in the app", () => {
    test("inject(Logger) gives the app's logger; listen() would log through it too", async () => {
        const lines: string[] = [];
        const app = createApp({ controllers: [Hello], logger: { level: "info", format: "json", write: (line) => void lines.push(line) } });
        await app.init();
        await app.fetch(new Request("http://x/"));
        expect(json(lines)).toEqual([expect.objectContaining({ level: "info", module: "hello", msg: "Said hello" })]);
    });

    test("a Logger provider replaces the option, for tests", async () => {
        const lines: string[] = [];
        const app = createApp({ controllers: [Hello], logger: false });
        app.provide({ provide: Logger, useValue: new Logger({ level: "info", format: "json", write: (line) => void lines.push(line) }) });
        await app.init();
        await app.fetch(new Request("http://x/"));
        expect(json(lines)).toHaveLength(1);
    });

    test("logger: false logs nothing", async () => {
        const app = createApp({ controllers: [Hello], logger: false });
        await app.init();
        expect(app.get(Logger).enabled("fatal")).toBe(false);
    });

    test("without request logging or any other option, the app keeps its plain request path", async () => {
        const app = createApp({ controllers: [Hello], logger: false });
        await app.init();
        expect((app as any).runtime.observer).toBeNull();
        const observed = createApp({ controllers: [Hello], logger: false, securityHeaders: true });
        await observed.init();
        expect((observed as any).runtime.observer).not.toBeNull();
    });
});

describe("health", () => {
    class Cache implements HealthCheck {
        checkHealth() {
            return false;
        }
    }

    @Controller("/cached")
    class Cached {
        readonly cache = inject(Cache);
    }

    test("probes are routes, but not in OpenAPI", async () => {
        const app = createApp({ controllers: [Hello], logger: false, health: { path: "/livez", readyPath: "/readyz" } });
        await app.init();
        expect(app.routes.filter((route) => route.handler.startsWith("Sparkus."))).toEqual([
            expect.objectContaining({ method: "GET", path: "/livez", handler: "Sparkus.health" }),
            expect.objectContaining({ method: "GET", path: "/readyz", handler: "Sparkus.ready" }),
        ]);
        expect(Object.keys((app.openapi() as any).paths)).toEqual(["/"]);
    });

    test("a check returning false fails readiness; messages only with exposeErrors", async () => {
        const app = createApp({ controllers: [Cached], logger: false, health: true, exposeErrors: false });
        await app.init();
        const res = await app.fetch(new Request("http://x/ready"));
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ code: "SPK2009", detail: "Not ready: Cache failed.", checks: { Cache: "error" } });
    });

    test("readiness fails as soon as the app shuts down, liveness does not", async () => {
        const app = createApp({ controllers: [Hello], logger: false, health: true });
        await app.init();
        expect((await app.fetch(new Request("http://x/ready"))).status).toBe(200);
        await app.close();
        const ready = await app.fetch(new Request("http://x/ready"));
        expect(ready.status).toBe(503);
        expect(((await ready.json()) as any).detail).toBe("The app is shutting down.");
        expect((await app.fetch(new Request("http://x/health"))).status).toBe(200);
    });

    test("a slow check counts as failed after the timeout", async () => {
        class Slow implements HealthCheck {
            checkHealth() {
                return new Promise(() => {});
            }
        }
        @Controller("/s")
        class UsesSlow {
            readonly slow = inject(Slow);
        }
        const app = createApp({ controllers: [UsesSlow], logger: false, health: { timeout: 20 }, exposeErrors: true });
        await app.init();
        const res = await app.fetch(new Request("http://x/ready"));
        expect(((await res.json()) as any).checks).toEqual({ Slow: "error: timed out after 20 ms" });
    });
});
