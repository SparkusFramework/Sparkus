/**
 * Micro-benchmark of body validation for the bench's CreateUser schema:
 * Sparkus' compiled validator against a hand-written check (the floor),
 * TypeBox's compiler (what Elysia runs) and ajv with Fastify's options.
 * Valid and invalid bodies; on failure every validator also produces the
 * first error, as each framework does before answering 400/422.
 *
 *   bun bench/with-lock.ts -- bun bench/micro/validator.js [coreDist] [--rounds 9] [--ms 150]
 *   bun bench/with-lock.ts -- node bench/micro/validator.js [coreDist] ...
 *
 * Needs the machine-wide bench lock: run it under with-lock.ts.
 */
import { createRequire } from "node:module";
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

const { t } = await import(pathToFileURL(join(dist, "index.js")).href);
const { compileValidator } = await import(pathToFileURL(join(dist, "engine.js")).href);

// Competitors' validators, resolved through the frameworks that ship them.
const benchRequire = createRequire(join(import.meta.dirname, "../package.json"));
const fromElysia = createRequire(benchRequire.resolve("elysia/package.json"));
const { TypeCompiler } = fromElysia("@sinclair/typebox/compiler");
const { Type } = fromElysia("@sinclair/typebox");
const fromFastify = createRequire(benchRequire.resolve("fastify/package.json"));
const fromAjvCompiler = createRequire(fromFastify.resolve("@fastify/ajv-compiler/package.json"));
const Ajv = fromAjvCompiler("ajv").default;

const sparkus = compileValidator(
    t.object({ name: t.string({ min: 1, max: 100 }), age: t.integer({ min: 0, max: 150 }) }),
);

function byHand(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { path: "$", message: "must be an object" };
    const name = value.name;
    if (name === undefined) return { path: "$.name", message: "is required" };
    if (typeof name !== "string") return { path: "$.name", message: "must be a string" };
    if (name.length < 1) return { path: "$.name", message: "must have at least 1 characters" };
    if (name.length > 100) return { path: "$.name", message: "must have at most 100 characters" };
    const age = value.age;
    if (age === undefined) return { path: "$.age", message: "is required" };
    if (!Number.isInteger(age)) return { path: "$.age", message: "must be an integer" };
    if (age < 0) return { path: "$.age", message: "must be >= 0" };
    if (age > 150) return { path: "$.age", message: "must be <= 150" };
    return null;
}

const typebox = TypeCompiler.Compile(
    Type.Object({
        name: Type.String({ minLength: 1, maxLength: 100 }),
        age: Type.Integer({ minimum: 0, maximum: 150 }),
    }),
);
const typeboxCheck = (value) => (typebox.Check(value) ? null : typebox.Errors(value).First());

// Fastify's defaults for body validation (@fastify/ajv-compiler).
const ajv = new Ajv({ coerceTypes: "array", useDefaults: true, removeAdditional: true, uriResolver: undefined, addUsedSchema: false, allErrors: false });
const ajvValidate = ajv.compile({
    type: "object",
    required: ["name", "age"],
    properties: { name: { type: "string", minLength: 1, maxLength: 100 }, age: { type: "integer", minimum: 0, maximum: 150 } },
});
const ajvCheck = (value) => (ajvValidate(value) ? null : ajvValidate.errors[0]);

// Fresh objects with the shape JSON.parse gives, rotated so no validator sees a constant.
const VALID = Array.from({ length: 64 }, (_, i) => JSON.parse(`{"name":"Ada ${i}","age":${i}}`));
const INVALID = Array.from({ length: 64 }, (_, i) => JSON.parse(`{"name":"","age":${-1 - i}}`));

const validators = { "hand-written": byHand, sparkus, "typebox (elysia)": typeboxCheck, "ajv (fastify)": ajvCheck };
for (const [name, check] of Object.entries(validators)) {
    if (check(VALID[0]) !== null || check(INVALID[0]) === null) throw new Error(`${name} disagrees on the contract`);
}

let sink = 0;
const cases = {};
for (const [name, check] of Object.entries(validators)) {
    cases[`valid    ${name}`] = (i) => {
        if (check(VALID[i & 63]) === null) sink++;
    };
    cases[`invalid  ${name}`] = (i) => {
        if (check(INVALID[i & 63]) !== null) sink++;
    };
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

const runtimeName = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.version}`;
console.log(`${runtimeName} · ${ROUNDS} rounds x ${MS} ms (median, [min-max]) · sink ${sink > 0}`);
for (const name of names) {
    const values = samples.get(name);
    console.log(
        `${name.padEnd(28)} ${median(values).toFixed(1).padStart(7)} ns  [${Math.min(...values).toFixed(1)}-${Math.max(...values).toFixed(1)}]`,
    );
}
