/**
 * Micro-benchmark of response serialization, to choose how Sparkus turns a
 * value with a response schema into JSON:
 *
 * - "stringify": JSON.stringify of the handler's value (today, no schema used);
 * - "compiled": string concatenation generated from the schema, fields read
 *   directly, strings escaped by JSON.stringify (fast-json-stringify's idea);
 * - "compiled+escape": same, strings checked by a regex and quoted by hand;
 * - "project": a new object with only the declared fields, then JSON.stringify.
 *
 * Under Bun, each one also builds the Response the engine would send:
 * Response.json(value) against new Response(string, init).
 *
 *   bun bench/with-lock.ts -- bun bench/micro/serializer.js [--rounds 9] [--ms 150]
 *   bun bench/with-lock.ts -- node bench/micro/serializer.js ...
 *
 * Needs the machine-wide bench lock: run it under with-lock.ts.
 */
if (process.env.SPARKUS_BENCH_LOCK_OWNER === undefined) {
    console.error("Run it under the machine-wide bench lock: bun bench/with-lock.ts -- <runtime> " + process.argv[1]);
    process.exit(2);
}

const argv = process.argv.slice(2);
const flags = new Map();
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) flags.set(argv[i].slice(2), argv[++i]);
const ROUNDS = Number(flags.get("rounds") ?? 9);
const MS = Number(flags.get("ms") ?? 150);

const ESCAPE = /[\u0000-\u001f"\\\ud800-\udfff]/;
const str = (s) => (s.length < 42 && !ESCAPE.test(s) ? '"' + s + '"' : JSON.stringify(s));

function mismatch() {
    throw new Error("mismatch");
}

// What the generated code looks like for each payload, written out by hand.
const payloads = {
    hello: {
        values: Array.from({ length: 64 }, (_, i) => ({ hello: "world" + (i & 1 ? "" : " ") })),
        compiled(v) {
            const a = v.hello;
            if (typeof a !== "string") mismatch();
            return '{"hello":' + JSON.stringify(a) + "}";
        },
        escaped(v) {
            const a = v.hello;
            if (typeof a !== "string") mismatch();
            return '{"hello":' + str(a) + "}";
        },
        project: (v) => ({ hello: v.hello }),
    },
    user: {
        values: Array.from({ length: 64 }, (_, i) => ({ id: i, name: "User " + i, age: 20 + i })),
        compiled(v) {
            const a = v.id;
            const b = v.name;
            const c = v.age;
            if (typeof a !== "number" || typeof b !== "string" || typeof c !== "number") mismatch();
            return '{"id":' + a + ',"name":' + JSON.stringify(b) + ',"age":' + c + "}";
        },
        escaped(v) {
            const a = v.id;
            const b = v.name;
            const c = v.age;
            if (typeof a !== "number" || typeof b !== "string" || typeof c !== "number") mismatch();
            return '{"id":' + a + ',"name":' + str(b) + ',"age":' + c + "}";
        },
        project: (v) => ({ id: v.id, name: v.name, age: v.age }),
    },
    "users-10": {
        values: Array.from({ length: 64 }, (_, j) =>
            Array.from({ length: 10 }, (_, i) => ({ id: i + j, name: "User " + i, email: `u${i}@example.com`, admin: i === 0 })),
        ),
        compiled(v) {
            if (!Array.isArray(v)) mismatch();
            let s = "[";
            for (let i = 0; i < v.length; i++) {
                const e = v[i];
                if (typeof e !== "object" || e === null) mismatch();
                const a = e.id;
                const b = e.name;
                const c = e.email;
                const d = e.admin;
                if (typeof a !== "number" || typeof b !== "string" || typeof c !== "string" || typeof d !== "boolean") mismatch();
                if (i > 0) s += ",";
                s += '{"id":' + a + ',"name":' + JSON.stringify(b) + ',"email":' + JSON.stringify(c) + ',"admin":' + d + "}";
            }
            return s + "]";
        },
        escaped(v) {
            if (!Array.isArray(v)) mismatch();
            let s = "[";
            for (let i = 0; i < v.length; i++) {
                const e = v[i];
                if (typeof e !== "object" || e === null) mismatch();
                const a = e.id;
                const b = e.name;
                const c = e.email;
                const d = e.admin;
                if (typeof a !== "number" || typeof b !== "string" || typeof c !== "string" || typeof d !== "boolean") mismatch();
                if (i > 0) s += ",";
                s += '{"id":' + a + ',"name":' + str(b) + ',"email":' + str(c) + ',"admin":' + d + "}";
            }
            return s + "]";
        },
        project(v) {
            const out = new Array(v.length);
            for (let i = 0; i < v.length; i++) {
                const e = v[i];
                out[i] = { id: e.id, name: e.name, email: e.email, admin: e.admin };
            }
            return out;
        },
    },
};

const isBun = typeof Bun !== "undefined";
const { Buffer } = await import("node:buffer");
const JSON_INIT = { headers: { "content-type": "application/json;charset=utf-8" } };

let sink = 0;
const cases = {};
for (const [name, p] of Object.entries(payloads)) {
    const values = p.values;
    for (const v of values) {
        const expected = JSON.stringify(v);
        for (const fn of [p.compiled, p.escaped]) if (fn(v) !== expected) throw new Error(`${name}: ${fn(v)} != ${expected}`);
        if (JSON.stringify(p.project(v)) !== expected) throw new Error(`${name}: projection differs`);
    }
    cases[`${name.padEnd(9)} stringify`] = (i) => void (sink += JSON.stringify(values[i & 63]).length);
    cases[`${name.padEnd(9)} compiled`] = (i) => void (sink += p.compiled(values[i & 63]).length);
    cases[`${name.padEnd(9)} compiled+escape`] = (i) => void (sink += p.escaped(values[i & 63]).length);
    cases[`${name.padEnd(9)} project`] = (i) => void (sink += JSON.stringify(p.project(values[i & 63])).length);
    // Node's engine measures every body before writing it: a concatenated string is flattened here.
    cases[`${name.padEnd(9)} stringify+len`] = (i) => void (sink += Buffer.byteLength(JSON.stringify(values[i & 63])));
    cases[`${name.padEnd(9)} escape+len`] = (i) => void (sink += Buffer.byteLength(p.escaped(values[i & 63])));
    if (isBun) {
        cases[`${name.padEnd(9)} Response(stringify)`] = (i) =>
            void (sink += new Response(JSON.stringify(values[i & 63]), JSON_INIT).status);
        cases[`${name.padEnd(9)} Response(stringify) no init`] = (i) =>
            void (sink += new Response(JSON.stringify(values[i & 63])).status);
        cases[`${name.padEnd(9)} Response(escape) no init`] = (i) => void (sink += new Response(p.escaped(values[i & 63])).status);
        cases[`${name.padEnd(9)} Response.json`] = (i) => void (sink += Response.json(values[i & 63]).status);
        cases[`${name.padEnd(9)} Response(compiled)`] = (i) => void (sink += new Response(p.compiled(values[i & 63]), JSON_INIT).status);
        cases[`${name.padEnd(9)} Response(escape)`] = (i) => void (sink += new Response(p.escaped(values[i & 63]), JSON_INIT).status);
        cases[`${name.padEnd(9)} Response.json(proj)`] = (i) => void (sink += Response.json(p.project(values[i & 63])).status);
    }
}

function measure(step) {
    let ops = 0;
    const start = performance.now();
    let now = start;
    while (now - start < MS) {
        for (let i = 0; i < 10_000; i++) step(i);
        ops += 10_000;
        now = performance.now();
    }
    return ((now - start) * 1e6) / ops;
}

const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};
const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const names = Object.keys(cases);
for (const name of names) for (let i = 0; i < 3; i++) measure(cases[name]);
const samples = new Map(names.map((name) => [name, []]));
for (let round = 0; round < ROUNDS; round++) for (const name of shuffle(names)) samples.get(name).push(measure(cases[name]));

const runtimeName = isBun ? `Bun ${Bun.version}` : `Node ${process.version}`;
console.log(`${runtimeName} · ${ROUNDS} rounds x ${MS} ms (median, [min-max]) · sink ${sink > 0}`);
for (const name of names) {
    const values = samples.get(name);
    console.log(
        `${name.padEnd(34)} ${median(values).toFixed(1).padStart(7)} ns  [${Math.min(...values).toFixed(1)}-${Math.max(...values).toFixed(1)}]`,
    );
}
