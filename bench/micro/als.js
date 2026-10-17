// What propagating the request context with AsyncLocalStorage costs per request, in process:
// als.run() around a sync or async handler, getStore() in a log call, and what an app that
// never calls run() pays once an AsyncLocalStorage exists.
//
//     bun with-lock.ts -- bun micro/als.js
//     bun with-lock.ts -- <node 22+> micro/als.js
if (process.env.SPARKUS_BENCH_LOCK_OWNER === undefined) {
    console.error("Run it under the machine-wide bench lock: bun bench/with-lock.ts -- bun " + process.argv[1]);
    process.exit(2);
}

import { AsyncLocalStorage } from "node:async_hooks";

function bench(name, fn, n = 2_000_000) {
    for (let i = 0; i < n / 10; i++) fn(i);
    const start = performance.now();
    let sink;
    for (let i = 0; i < n; i++) sink = fn(i);
    const ns = ((performance.now() - start) * 1e6) / n;
    console.log(`${name.padEnd(52)} ${ns.toFixed(1).padStart(7)} ns`);
    return sink;
}

/** Same, for functions returning a promise: n requests in flight at most `width` at a time. */
async function benchAsync(name, fn, n = 1_000_000, width = 100) {
    const run = async (count) => {
        for (let i = 0; i < count; i += width) {
            const batch = [];
            for (let j = 0; j < width; j++) batch.push(fn(i + j));
            await Promise.all(batch);
        }
    };
    await run(n / 10);
    const start = performance.now();
    await run(n);
    const ns = ((performance.now() - start) * 1e6) / n;
    console.log(`${name.padEnd(52)} ${ns.toFixed(1).padStart(7)} ns`);
}

const runtime = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`;
console.log(runtime);

class Ctx {
    constructor(id) {
        this.id = id;
        this.status = 200;
    }
}
const handler = (ctx) => ctx.status + ctx.id;
const asyncHandler = async (ctx) => {
    await null;
    return ctx.status + ctx.id;
};
const deepAsync = async (ctx) => {
    // A service call or two: each await carries the context along.
    const a = await Promise.resolve(ctx.id);
    const b = await Promise.resolve(a + 1);
    return b + ctx.status;
};

console.log("--- before any AsyncLocalStorage exists");
bench("handler(ctx) sync", (i) => handler(new Ctx(i)));
await benchAsync("async handler, 1 await", (i) => asyncHandler(new Ctx(i)));
await benchAsync("async handler, 2 awaits", (i) => deepAsync(new Ctx(i)));

const als = new AsyncLocalStorage();
console.log("--- AsyncLocalStorage exists, run() never called");
bench("handler(ctx) sync", (i) => handler(new Ctx(i)));
await benchAsync("async handler, 1 await", (i) => asyncHandler(new Ctx(i)));
await benchAsync("async handler, 2 awaits", (i) => deepAsync(new Ctx(i)));

console.log("--- als.run(ctx, handler, ctx)");
bench("run, sync handler", (i) => {
    const ctx = new Ctx(i);
    return als.run(ctx, handler, ctx);
});
await benchAsync("run, async handler, 1 await", (i) => {
    const ctx = new Ctx(i);
    return als.run(ctx, asyncHandler, ctx);
});
await benchAsync("run, async handler, 2 awaits", (i) => {
    const ctx = new Ctx(i);
    return als.run(ctx, deepAsync, ctx);
});

console.log("--- getStore()");
bench("getStore() outside run", () => als.getStore());
const inside = new Ctx(1);
als.run(inside, () => bench("getStore() inside run", () => als.getStore()));
await benchAsync("getStore() after an await, inside run", (i) => {
    const ctx = new Ctx(i);
    return als.run(ctx, async () => {
        await null;
        return als.getStore().id;
    });
});

console.log("--- after run() was used: plain requests again");
bench("handler(ctx) sync", (i) => handler(new Ctx(i)));
await benchAsync("async handler, 1 await", (i) => asyncHandler(new Ctx(i)));
await benchAsync("async handler, 2 awaits", (i) => deepAsync(new Ctx(i)));
