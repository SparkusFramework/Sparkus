// The app with every production option on: CORS, security headers, request ids, request logs
// and request context, health probes, timeouts, telemetry. Every engine must serve it identically;
// test/production.test.ts holds the expected responses.
import {
    Controller,
    Get,
    Logger,
    Post,
    Put,
    inject,
    t,
    type AppOptions,
    type Attributes,
    type Ctx,
    type HealthCheck,
    type Meter,
    type Span,
    type Tracer,
} from "sparkus";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Log lines of the production fixture, parsed. Filled only in the process that runs the app. */
export const productionLogs: Array<Record<string, any>> = [];
/** The same lines as written, for what parsing hides (a duplicated key). */
const productionLines: string[] = [];

let spanIds = 0;

export class FakeSpan implements Span {
    readonly attributes: Attributes;
    status: { code: number; message?: string } | undefined;
    exceptions: unknown[] = [];
    ended = false;
    readonly ids = { traceId: (++spanIds).toString(16).padStart(32, "a"), spanId: spanIds.toString(16).padStart(16, "b") };

    constructor(
        readonly name: string,
        readonly kind: number | undefined,
        attributes: Attributes | undefined,
        readonly parent: unknown,
    ) {
        this.attributes = { ...attributes };
    }

    setAttribute(key: string, value: Attributes[string] & {}) {
        this.attributes[key] = value;
        return this;
    }

    setStatus(status: { code: number; message?: string }) {
        this.status = status;
        return this;
    }

    recordException(exception: unknown) {
        this.exceptions.push(exception);
    }

    end() {
        this.ended = true;
    }

    spanContext() {
        return this.ids;
    }
}

export const spans: FakeSpan[] = [];
export const durations: Array<{ name: string; value: number; attributes: Attributes | undefined }> = [];

const tracer: Tracer = {
    startSpan(name, options, context) {
        const span = new FakeSpan(name, options?.kind, options?.attributes, context);
        spans.push(span);
        return span;
    },
};

const meter: Meter = {
    createHistogram(name) {
        return { record: (value, attributes) => void durations.push({ name, value, attributes }) };
    },
};

export class Database implements HealthCheck {
    up = true;

    checkHealth() {
        if (!this.up) throw new Error("connection refused");
    }
}

/** A service that logs without ctx: the request context gives its lines the request id. */
export class Catalog {
    private readonly log = inject(Logger).child("catalog");

    onInit() {
        this.log.info("Catalog ready");
    }

    async find(probe: number, wait: number) {
        await sleep(wait);
        this.log.info("Catalog find", { probe });
        await Promise.resolve();
        return probe;
    }
}

const ContextProbe = { query: t.object({ probe: t.integer(), wait: t.integer({ default: 0 }) }) };

/** What the last timed-out request saw in ctx.signal. */
export const aborted: { reason: unknown } = { reason: undefined };

const GetItem = {
    params: t.object({ id: t.integer() }),
    query: t.object({
        sort: t.enum(["asc", "desc"], { default: "asc" }),
        page: t.integer({ min: 1, default: 1 }),
    }),
};

const CreateItem = {
    body: t.object({ name: t.string(), tags: t.array(t.enum(["new", "sale"]), { max: 2 }) }),
    bodyLimit: 64,
    status: 201,
};

@Controller("/items")
class ItemController {
    @Get("/:id", GetItem)
    get(ctx: Ctx<typeof GetItem>) {
        ctx.log.info("Item read", { id: ctx.params.id });
        return { id: ctx.params.id, sort: ctx.query.sort, page: ctx.query.page, requestId: ctx.requestId };
    }

    @Post("", CreateItem)
    create(ctx: Ctx<typeof CreateItem>) {
        return ctx.body;
    }

    @Put("/:id")
    replace() {
        return { replaced: true };
    }
}

@Controller("/ops")
class OpsController {
    private readonly db = inject(Database);
    private readonly catalog = inject(Catalog);

    /** The lines logged for this probe, as written: logs are inspectable on every target this way. */
    @Get("/context", ContextProbe)
    async context(ctx: Ctx<typeof ContextProbe>) {
        const { probe, wait } = ctx.query;
        await this.catalog.find(probe, wait);
        ctx.log.info("Context handler", { probe });
        const own = `"probe":${probe}`;
        return { lines: productionLines.filter((line) => line.includes(own) || line.includes('"Catalog ready"')) };
    }

    @Get("/slow", { timeout: 50 })
    async slow(ctx: Ctx) {
        ctx.signal.addEventListener("abort", () => {
            aborted.reason = ctx.signal.reason;
        });
        await sleep(1_000);
        return "too late";
    }

    @Get("/fast", { timeout: 1_000 })
    async fast() {
        await sleep(5);
        return { fast: true };
    }

    @Get("/csp")
    csp(ctx: Ctx) {
        ctx.setHeader("content-security-policy", "default-src 'self'");
        return "html-ish";
    }

    @Get("/response")
    response() {
        return new Response("own", { headers: { "x-frame-options": "ALLOW-FROM https://a.example" } });
    }

    @Get("/bad-header")
    badHeader(ctx: Ctx) {
        ctx.setHeader("content-disposition", 'attachment; filename="a' + String.fromCharCode(10) + 'b"');
        return "never sent";
    }

    @Get("/redirect")
    redirect() {
        return Response.redirect("https://example.com/login", 302);
    }

    @Get("/shared")
    shared() {
        return SHARED;
    }

    @Get("/boom")
    boom(): never {
        throw new Error("kaboom");
    }

    @Put("/db")
    setDatabase(ctx: Ctx) {
        this.db.up = ctx.query.up !== "false";
        return { up: this.db.up };
    }
}

export const ORIGIN = "https://app.example.com";

/** One Response object returned to every request: each must get its own headers. */
const SHARED = new Response(null, { status: 204 });

export function productionOptions(): Omit<AppOptions, "engine"> {
    return {
        controllers: [ItemController, OpsController],
        exposeErrors: true,
        logger: {
            format: "json",
            level: "info",
            requests: true,
            requestContext: true,
            write: (line) => {
                productionLines.push(line);
                productionLogs.push(JSON.parse(line));
            },
        },
        cors: { origin: [ORIGIN, /^https:\/\/[a-z0-9]+\.preview\.example\.com$/], credentials: true, exposedHeaders: ["x-total"] },
        securityHeaders: { "x-frame-options": "SAMEORIGIN" },
        requestId: true,
        health: true,
        telemetry: { tracer, meter, extract: (ctx) => ctx.header("traceparent") },
    };
}
