/**
 * Micro-benchmark of the compiled pipeline, without any HTTP: the cost of
 * guards, interceptors, body validation and error rendering on top of a bare
 * handler, as the engines run it (sync result used directly, promise
 * awaited with .then, errors rendered by the runtime).
 *
 *   bun bench/with-lock.ts -- bun bench/micro/pipeline.js [coreDist] [--rounds 9] [--ms 150] [--only a,b]
 *   bun bench/with-lock.ts -- node bench/micro/pipeline.js [coreDist] ...
 *
 * coreDist defaults to packages/core/dist (build first). Point it at the dist
 * of another checkout to A/B two versions in the same session. Needs the
 * machine-wide bench lock: run it under with-lock.ts.
 */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.SPARKUS_BENCH_LOCK_OWNER === undefined) {
    console.error("Run it under the machine-wide bench lock: bun bench/with-lock.ts -- <runtime> " + process.argv[1]);
    process.exit(2);
}

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags.set(argv[i].slice(2), argv[++i]);
    else positional.push(argv[i]);
}
const dist = resolve(positional[0] ?? join(import.meta.dirname, "../../packages/core/dist"));
const ROUNDS = Number(flags.get("rounds") ?? 9);
const MS = Number(flags.get("ms") ?? 150);
const only = flags.get("only")?.split(",");

// Public API only, so any built version of Sparkus can be measured.
const { Controller, Get, Post, UseGuards, UseInterceptors, createApp, t } = await import(
    pathToFileURL(join(dist, "index.js")).href
);

const BODY = { name: "Ada", age: 36 };
const BAD_BODY = { name: "", age: -1 };

/** Same shape as the engines' contexts: every field set in the constructor. */
class FakeCtx {
    constructor(body, params, status) {
        this.body = undefined;
        this.responseHeaders = null;
        this.parsedQuery = undefined;
        this.store = undefined;
        this.raw = body;
        this.params = params;
        this.status = status;
        this.method = "GET";
        this.path = "/x";
    }
    get state() {
        return (this.store ??= {});
    }
    header() {
        return undefined;
    }
    setHeader() {}
    readBody() {
        return Promise.resolve(this.raw);
    }
}

const method = (fn, name) => ({ kind: "method", name, static: false, private: false, addInitializer() {} });
const klass = (name) => ({ kind: "class", name, addInitializer() {} });

/** Builds a one-route app and returns its compiled route and runtime, through an engine that only captures them. */
async function build({ guards = [], interceptors = [], appGuards = [], appInterceptors = [], body, handler }) {
    class C {}
    const fn = handler ?? function h() {
        return { hello: "world" };
    };
    Object.defineProperty(C.prototype, "h", { value: fn, writable: true, configurable: true });
    (body ? Post("/x", { body, status: 201 }) : Get("/x"))(fn, method(fn, "h"));
    if (guards.length) UseGuards(...guards)(fn, method(fn, "h"));
    if (interceptors.length) UseInterceptors(...interceptors)(fn, method(fn, "h"));
    Controller()(C, klass("C"));
    let runtime;
    const engine = {
        name: "micro",
        async listen(captured) {
            runtime = captured;
            return { port: 0, hostname: "micro", stop: async () => {} };
        },
    };
    const app = createApp({
        controllers: [C],
        guards: appGuards,
        interceptors: appInterceptors,
        exposeErrors: false,
        logger: { error() {} },
        engine,
    });
    await app.listen({ port: 0, signals: false });
    return { route: runtime.routes[0], runtime };
}

const allow = () => true;
const allowAsync = async () => true;
const deny = () => false;
class AllowGuard {
    canActivate() {
        return true;
    }
}
const pass = (ctx, next) => next();
const passAsync = async (ctx, next) => await next();
class PassInterceptor {
    intercept(ctx, next) {
        return next();
    }
}
const CreateUser = t.object({ name: t.string({ min: 1, max: 100 }), age: t.integer({ min: 0, max: 150 }) });

let sink = 0;
const ok = (value) => {
    if (value !== undefined) sink++;
};

/** One request as an engine runs it. */
function requester({ route, runtime }, raw) {
    const { run, status } = route;
    const params = Object.freeze({});
    const fail = (ctx) => (error) => {
        sink += runtime.renderError(error, ctx).body.length;
    };
    return () => {
        const ctx = new FakeCtx(raw, params, status);
        try {
            const out = run(ctx);
            if (out instanceof Promise) out.then(ok, fail(ctx));
            else ok(out);
        } catch (error) {
            fail(ctx)(error);
        }
    };
}

const cases = {
    "none": requester(await build({})),
    "handler async": requester(
        await build({
            handler: async function h() {
                return { hello: "world" };
            },
        }),
    ),
    "guard sync": requester(await build({ guards: [allow] })),
    "guard sync (class)": requester(await build({ guards: [AllowGuard] })),
    "guard sync (app)": requester(await build({ appGuards: [allow] })),
    "guard async": requester(await build({ guards: [allowAsync] })),
    "3 guards sync": requester(await build({ guards: [allow, allow, allow] })),
    "interceptor": requester(await build({ interceptors: [pass] })),
    "interceptor (class)": requester(await build({ interceptors: [PassInterceptor] })),
    "interceptor (app)": requester(await build({ appInterceptors: [pass] })),
    "interceptor async": requester(await build({ interceptors: [passAsync] })),
    "3 interceptors": requester(await build({ interceptors: [pass, pass, pass] })),
    "guard + interceptor": requester(await build({ guards: [allow], interceptors: [pass] })),
    "body valid": requester(await build({ body: CreateUser }), BODY),
    "body invalid (400)": requester(await build({ body: CreateUser }), BAD_BODY),
    "guard deny (403)": requester(await build({ guards: [deny] })),
    "handler throws (500)": requester(
        await build({
            handler: function h() {
                throw new Error("boom");
            },
        }),
    ),
};
{
    const { runtime } = await build({});
    cases["404 render"] = () => {
        sink += runtime.notFound("GET", "/nope").body.length;
    };
    cases["405 render"] = () => {
        sink += runtime.methodNotAllowed("DELETE", "/x", "GET, HEAD").body.length;
    };
}

const names = Object.keys(cases).filter((name) => !only || only.includes(name));
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function measure(step) {
    const BATCH = 1000;
    let ops = 0;
    const start = performance.now();
    let now = start;
    while (now - start < MS) {
        for (let i = 0; i < BATCH; i++) step();
        await tick();
        ops += BATCH;
        now = performance.now();
    }
    return ((now - start) * 1e6) / ops;
}

function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}


const runtimeName = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`;
// Warm-up: every case reaches the optimizing tier before anything is measured.
for (const name of names) for (let i = 0; i < 3; i++) await measure(cases[name]);

const samples = new Map(names.map((name) => [name, []]));
for (let round = 0; round < ROUNDS; round++) {
    for (const name of shuffle(names)) samples.get(name).push(await measure(cases[name]));
}

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const base = median(samples.get("none") ?? [0]);
console.log(`${runtimeName} · ${dist} · ${ROUNDS} rounds x ${MS} ms (median, [min-max]) · sink ${sink > 0}`);
console.log(`${"case".padEnd(22)} ${"ns/req".padStart(8)}  ${"vs none".padStart(8)}  spread`);
for (const name of names) {
    const values = samples.get(name);
    const m = median(values);
    const spread = `[${Math.min(...values).toFixed(1)}-${Math.max(...values).toFixed(1)}]`;
    console.log(`${name.padEnd(22)} ${m.toFixed(1).padStart(8)}  ${(m - base >= 0 ? "+" : "") + (m - base).toFixed(1).padStart(7)}  ${spread}`);
}
