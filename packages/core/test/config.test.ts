import { describe, expect, test } from "bun:test";
import { Controller, Get, createApp, inject, type Ctx } from "../src/index.js";
import { config } from "../src/config.js";
import { Container } from "../src/di.js";
import { t } from "../src/schema.js";

const shape = {
    DATABASE_URL: t.string({ min: 1 }),
    PORT: t.integer({ min: 1, max: 65535, default: 3000 }),
    RATIO: t.optional(t.number()),
    DEBUG: t.boolean({ default: false }),
    MODE: t.enum(["live", "sandbox"], { default: "sandbox" }),
    ORIGINS: t.optional(t.array(t.string())),
};

function load(env: Record<string, string | undefined>) {
    return new Container().get(config(shape, { env }));
}

describe("config()", () => {
    test("converts every variable, applies defaults, leaves unset optional ones out", () => {
        const values = load({ DATABASE_URL: "postgres://x", PORT: "8080", DEBUG: "TRUE", ORIGINS: "https://a.com, https://b.com,," });
        expect(values).toEqual({
            DATABASE_URL: "postgres://x",
            PORT: 8080,
            DEBUG: true,
            MODE: "sandbox",
            ORIGINS: ["https://a.com", "https://b.com"],
        });
        expect("RATIO" in values).toBe(false);
        expect(Object.isFrozen(values)).toBe(true);
    });

    test("an empty variable counts as unset", () => {
        expect(load({ DATABASE_URL: "x", PORT: "" }).PORT).toBe(3000);
        expect(() => load({ DATABASE_URL: "" })).toThrow("DATABASE_URL is required");
    });

    test("every problem is listed at once, without the values", () => {
        let message = "";
        try {
            load({ PORT: "80a", DEBUG: "yes", MODE: "prod", RATIO: "1,5", ORIGINS: "secret-token-value" });
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).toBe(
            "[SPK1018] Invalid configuration (Config): DATABASE_URL is required; PORT must be an integer; " +
                'RATIO must be a number; DEBUG must be "true", "false", "1" or "0"; MODE must be one of "live", "sandbox". ' +
                "Set these environment variables (shell, .env file, deployment settings), or change the config() schema.",
        );
        expect(message).not.toContain("80a");
    });

    test("bounds and array items are checked", () => {
        expect(() => load({ DATABASE_URL: "x", PORT: "70000" })).toThrow("PORT must be <= 65535");
        const ports = config({ PORTS: t.array(t.integer(), { min: 1 }) }, { env: { PORTS: "80,x" } });
        expect(() => new Container().get(ports)).toThrow("PORTS has an invalid item 2: it must be an integer");
    });

    test("shapes that environment variables cannot fill are refused at once", () => {
        expect(() => config({ DB: t.object({ url: t.string() }) as any })).toThrow(
            "[SPK1018] config() Config: DB is t.object(), but environment variables are flat strings.",
        );
        expect(() => config({ NAME: t.nullable(t.string()) })).toThrow("NAME is nullable");
        expect(() => config({ PORT: t.integer({ min: 1, default: 0 }) })).toThrow("PORT has default 0, which must be >= 1.");
    });

    test("read from process.env when the app starts, injected like any token", async () => {
        const AppConfig = config({ SPARKUS_TEST_GREETING: t.string({ default: "hi" }) }, { name: "AppConfig" });

        @Controller()
        class Hello {
            private readonly config = inject(AppConfig);

            @Get("/")
            get(_ctx: Ctx) {
                return { greeting: this.config.SPARKUS_TEST_GREETING };
            }
        }

        process.env.SPARKUS_TEST_GREETING = "bonjour";
        try {
            const app = createApp({ controllers: [Hello], logger: false });
            await app.init();
            expect(await (await app.fetch(new Request("http://x/"))).json()).toEqual({ greeting: "bonjour" });
        } finally {
            delete process.env.SPARKUS_TEST_GREETING;
        }
    });

    test("a missing variable stops the app at startup with SPK1018", async () => {
        const AppConfig = config({ SPARKUS_TEST_MISSING: t.string() }, { name: "AppConfig" });

        @Controller()
        class Needs {
            readonly config = inject(AppConfig);
        }

        const app = createApp({ controllers: [Needs], logger: false });
        expect(app.init()).rejects.toThrow("[SPK1018] Invalid configuration (AppConfig): SPARKUS_TEST_MISSING is required.");
    });

    test("tests replace it with a provider", async () => {
        const AppConfig = config({ SPARKUS_TEST_MISSING: t.string() });
        const container = new Container();
        container.provide({ provide: AppConfig, useValue: { SPARKUS_TEST_MISSING: "fake" } });
        expect(container.get(AppConfig).SPARKUS_TEST_MISSING).toBe("fake");
    });
});

describe("config override() for tests", () => {
    const AppConfig = config(
        { SECRET: t.string({ min: 1 }), PAGE_SIZE: t.integer({ min: 1, default: 20 }), MODE: t.enum(["a", "b"], { default: "a" }) },
        { name: "AppConfig", env: {} },
    );

    test("typed values over the environment, defaults kept, the required one given", () => {
        const container = new Container();
        container.provide(AppConfig.override({ SECRET: "s", PAGE_SIZE: 5 }));
        expect(container.get(AppConfig)).toEqual({ SECRET: "s", PAGE_SIZE: 5, MODE: "a" });
    });

    test("overrides still pass the schema, and missing required variables are still reported", () => {
        const invalid = new Container();
        invalid.provide(AppConfig.override({ SECRET: "s", PAGE_SIZE: 0 }));
        expect(() => invalid.get(AppConfig)).toThrow("PAGE_SIZE (override) must be >= 1");
        const missing = new Container();
        missing.provide(AppConfig.override({ PAGE_SIZE: 5 }));
        expect(() => missing.get(AppConfig)).toThrow("SECRET is required");
    });

    test("a default with t.optional() is refused, numbers must be finite, enums are trimmed", () => {
        expect(() => config({ N: t.optional(t.integer({ default: 1 })) })).toThrow("N has both t.optional() and a default");
        const big = config({ N: t.number() }, { env: { N: "1e999" } });
        expect(() => new Container().get(big)).toThrow("N must be a finite number");
        expect(new Container().get(config({ M: t.enum(["live"]) }, { env: { M: " live " } })).M).toBe("live");
    });
});
