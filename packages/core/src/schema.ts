/**
 * Minimal schema builder. Each schema carries its TypeScript type (for
 * inference) and is compiled once into plain functions: a validator, a body
 * parser and a response projector.
 */
import { ErrorCode, SparkusError } from "./errors.js";
import type { StandardSchemaV1 } from "./standard.js";

type Kind = "string" | "integer" | "number" | "boolean" | "object" | "array";

interface Bounds {
    min?: number;
    max?: number;
}

export interface Schema<T = unknown, Optional extends boolean = boolean> {
    readonly kind: Kind;
    readonly bounds: Bounds;
    readonly optional: Optional;
    readonly shape?: Record<string, Schema>;
    readonly item?: Schema;
    /** Phantom field: carries the inferred type, never set at runtime. */
    readonly __type?: T;
}

export type Infer<S> = S extends Schema<infer T, boolean> ? T : never;

/** What a route accepts as a schema: a `t` schema, or any Standard Schema (Zod, Valibot, ArkType...). */
export type AnySchema = Schema | StandardSchemaV1;

/** Type a schema produces: what `ctx.body`, `ctx.params` and `ctx.query` hold. */
export type Output<S> = S extends Schema ? Infer<S> : S extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S> : never;

/** Type a schema accepts: what a handler returns for its `response` schema. */
export type Input<S> = S extends Schema ? Infer<S> : S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : never;

type Shape = Record<string, Schema<unknown, boolean>>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type ObjectType<S extends Shape> = Simplify<
    { [K in keyof S as S[K] extends Schema<unknown, true> ? never : K]: Infer<S[K]> } & {
        [K in keyof S as S[K] extends Schema<unknown, true> ? K : never]?: Infer<S[K]>;
    }
>;

function node<T>(kind: Kind, bounds: Bounds = {}, extra: Partial<Schema> = {}): Schema<T, false> {
    return { kind, bounds, optional: false, ...extra } as Schema<T, false>;
}

export const t = {
    string: (bounds?: Bounds) => node<string>("string", bounds),
    integer: (bounds?: Bounds) => node<number>("integer", bounds),
    number: (bounds?: Bounds) => node<number>("number", bounds),
    boolean: () => node<boolean>("boolean"),
    object: <S extends Shape>(shape: S) => node<ObjectType<S>>("object", {}, { shape }),
    array: <S extends Schema>(item: S, bounds?: Bounds) => node<Infer<S>[]>("array", bounds, { item }),
    optional: <T>(schema: Schema<T, boolean>) => ({ ...schema, optional: true }) as Schema<T, true>,
};

export interface Issue {
    path: string;
    message: string;
}

export type Validator = (value: unknown) => Issue | null;

/** Validates a value and returns a copy holding only the declared fields. Throws on the first issue. */
export type Parser = (value: unknown) => unknown;

/** Reduces a handler's value to the fields its response schema declares. Throws when the shape does not match. */
export type Projector = (value: unknown) => unknown;

interface Emitted {
    code: string;
    /** Expression holding the result: the input itself when nothing needs copying. */
    out: string;
}

interface Field {
    key: string;
    out: string;
    optional: boolean;
}

const prop = (key: string) => `[${JSON.stringify(key)}]`;

/**
 * Object built with the declared fields, in declaration order. An absent optional field is
 * left out, not set to undefined: `{ ...entity, ...ctx.body }` must not erase what the client
 * did not send.
 */
function buildObject(target: string, fields: readonly Field[]): string {
    const first = fields.findIndex((field) => field.optional);
    const leading = first === -1 ? fields : fields.slice(0, first);
    let code = `const ${target} = { ${leading.map((field) => `${JSON.stringify(field.key)}: ${field.out}`).join(", ")} };\n`;
    for (const field of first === -1 ? [] : fields.slice(first)) {
        const assign = `${target}${prop(field.key)} = ${field.out};`;
        code += field.optional ? `if (${field.out} !== undefined) ${assign}\n` : `${assign}\n`;
    }
    return code;
}

function checkKeys(schema: Schema, where: string): void {
    if (schema.shape !== undefined) {
        for (const [key, child] of Object.entries(schema.shape)) {
            // A "__proto__" key in a generated object literal would set the prototype instead.
            if (key === "__proto__") {
                throw new SparkusError(ErrorCode.InvalidRouteSchema, `${where}: field "__proto__" is not allowed. Rename it.`);
            }
            checkKeys(child, where);
        }
    }
    if (schema.item !== undefined) checkKeys(schema.item, where);
}

/**
 * Emits a flat sequence of checks with no closures. With `build`, objects
 * are rebuilt with their declared fields only; arrays are copied only when
 * their items are.
 */
function emitChecks(schema: Schema, fail: (path: string, message: string) => string, build: boolean): Emitted {
    let counter = 0;

    const emit = (s: Schema, v: string, path: string): Emitted => {
        const failWith = (message: string) => fail(path, message);
        const { min, max } = s.bounds;

        switch (s.kind) {
            case "string": {
                let code = `if (typeof ${v} !== "string") ${failWith("must be a string")}\n`;
                if (min !== undefined) code += `if (${v}.length < ${min}) ${failWith(`must have at least ${min} characters`)}\n`;
                if (max !== undefined) code += `if (${v}.length > ${max}) ${failWith(`must have at most ${max} characters`)}\n`;
                return { code, out: v };
            }
            case "integer":
            case "number": {
                let code =
                    s.kind === "integer"
                        ? `if (!Number.isInteger(${v})) ${failWith("must be an integer")}\n`
                        : `if (typeof ${v} !== "number" || !Number.isFinite(${v})) ${failWith("must be a number")}\n`;
                if (min !== undefined) code += `if (${v} < ${min}) ${failWith(`must be >= ${min}`)}\n`;
                if (max !== undefined) code += `if (${v} > ${max}) ${failWith(`must be <= ${max}`)}\n`;
                return { code, out: v };
            }
            case "boolean":
                return { code: `if (typeof ${v} !== "boolean") ${failWith("must be a boolean")}\n`, out: v };
            case "object": {
                let code = `if (typeof ${v} !== "object" || ${v} === null || Array.isArray(${v})) ${failWith("must be an object")}\n`;
                const fields: Field[] = [];
                for (const [key, child] of Object.entries(s.shape!)) {
                    const local = `v${counter++}`;
                    const childPath = `${path} + ${JSON.stringify("." + key)}`;
                    code += `const ${local} = ${v}${prop(key)};\n`;
                    if (child.optional) {
                        const inner = emit(child, local, childPath);
                        if (inner.out === local) {
                            code += `if (${local} !== undefined) {\n${inner.code}}\n`;
                            fields.push({ key, out: local, optional: true });
                        } else {
                            const copy = `w${counter++}`;
                            code += `let ${copy};\nif (${local} !== undefined) {\n${inner.code}${copy} = ${inner.out};\n}\n`;
                            fields.push({ key, out: copy, optional: true });
                        }
                    } else {
                        code += `if (${local} === undefined) ${fail(childPath, "is required")}\n`;
                        const inner = emit(child, local, childPath);
                        code += inner.code;
                        fields.push({ key, out: inner.out, optional: false });
                    }
                }
                if (!build) return { code, out: v };
                const target = `o${counter++}`;
                return { code: code + buildObject(target, fields), out: target };
            }
            case "array": {
                const i = `i${counter++}`;
                const el = `e${counter++}`;
                let code = `if (!Array.isArray(${v})) ${failWith("must be an array")}\n`;
                if (min !== undefined) code += `if (${v}.length < ${min}) ${failWith(`must have at least ${min} items`)}\n`;
                if (max !== undefined) code += `if (${v}.length > ${max}) ${failWith(`must have at most ${max} items`)}\n`;
                const inner = emit(s.item!, el, `${path} + "[" + ${i} + "]"`);
                const loop = `for (let ${i} = 0; ${i} < ${v}.length; ${i}++) {\nconst ${el} = ${v}[${i}];\n${inner.code}`;
                if (!build || inner.out === el) return { code: code + loop + "}\n", out: v };
                const target = `a${counter++}`;
                return { code: `${code}const ${target} = [];\n${loop}${target}.push(${inner.out});\n}\n`, out: target };
            }
        }
    };

    return emit(schema, "value", `"$"`);
}

/** Compiles a schema into a validator that reports the first issue and allocates nothing on success. */
export function compileValidator(schema: Schema): Validator {
    const fail = (path: string, message: string) => `return { path: ${path}, message: ${JSON.stringify(message)} };`;
    const { code } = emitChecks(schema, fail, false);
    return new Function("value", code + "return null;") as Validator;
}

/**
 * Compiles a body schema into a parser: validates like `compileValidator`, then
 * returns a copy holding only the declared fields. Unknown fields are dropped,
 * so `ctx.body` holds exactly what its type says.
 */
export function compileParser(schema: Schema, invalid: (issue: Issue) => Error, where: string): Parser {
    checkKeys(schema, where);
    const fail = (path: string, message: string) => `throw invalid({ path: ${path}, message: ${JSON.stringify(message)} });`;
    const { code, out } = emitChecks(schema, fail, true);
    return new Function("invalid", `return function parse(value) {\n${code}return ${out};\n};`)(invalid) as Parser;
}

function describe(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "an array";
    return typeof value === "object" ? "an object" : typeof value;
}

/**
 * Compiles a response schema into a projector: the handler's value reduced to
 * the declared fields, so an undeclared field (a password hash on an entity)
 * never reaches the client. Scalars are copied as they are, trusting the types;
 * objects and arrays are checked because their fields are read. Returns null
 * when the schema has nothing to filter (a scalar response).
 */
export function compileProjector(schema: Schema, where: string): Projector | null {
    if (schema.kind !== "object" && schema.kind !== "array") return null;
    checkKeys(schema, where);
    let counter = 0;

    const emit = (s: Schema, v: string, path: string): Emitted => {
        if (s.kind === "object") {
            let code = `if (typeof ${v} !== "object" || ${v} === null || Array.isArray(${v})) mismatch(${path}, "an object", ${v});\n`;
            const fields: string[] = [];
            for (const [key, child] of Object.entries(s.shape!)) {
                const local = `v${counter++}`;
                code += `const ${local} = ${v}${prop(key)};\n`;
                const inner = emit(child, local, `${path} + ${JSON.stringify("." + key)}`);
                if (inner.out === local) {
                    fields.push(`${JSON.stringify(key)}: ${local}`);
                } else if (child.optional) {
                    const copy = `w${counter++}`;
                    code += `let ${copy};\nif (${local} !== undefined) {\n${inner.code}${copy} = ${inner.out};\n}\n`;
                    fields.push(`${JSON.stringify(key)}: ${copy}`);
                } else {
                    code += inner.code;
                    fields.push(`${JSON.stringify(key)}: ${inner.out}`);
                }
            }
            // Every field, absent ones as undefined: one shape per schema, and JSON leaves them out.
            const target = `o${counter++}`;
            return { code: `${code}const ${target} = { ${fields.join(", ")} };\n`, out: target };
        }
        if (s.kind === "array") {
            const i = `i${counter++}`;
            const el = `e${counter++}`;
            const code = `if (!Array.isArray(${v})) mismatch(${path}, "an array", ${v});\n`;
            const inner = emit(s.item!, el, `${path} + "[" + ${i} + "]"`);
            if (inner.out === el) return { code, out: v };
            const target = `a${counter++}`;
            const loop =
                `const ${target} = new Array(${v}.length);\n` +
                `for (let ${i} = 0; ${i} < ${v}.length; ${i}++) {\nconst ${el} = ${v}[${i}];\n${inner.code}${target}[${i}] = ${inner.out};\n}\n`;
            return { code: code + loop, out: target };
        }
        return { code: "", out: v };
    };

    const mismatch = (path: string, expected: string, value: unknown): never => {
        throw new SparkusError(
            ErrorCode.ResponseMismatch,
            `${where} returned a value that does not match its response schema: ${path} must be ${expected}, got ${describe(value)}. ` +
                "Return what the schema declares, or fix the schema.",
        );
    };
    const { code, out } = emit(schema, "value", `"$"`);
    // A handler may always answer with its own Response.
    const body = `if (value instanceof Response) return value;\n${code}return ${out};`;
    return new Function("mismatch", `return function project(value) {\n${body}\n};`)(mismatch) as Projector;
}
