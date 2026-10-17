/**
 * Minimal schema builder. Each schema carries its TypeScript type (for
 * inference) and is compiled once into a plain validation function.
 */
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

/**
 * Compiles a schema into a validator. The generated code is a flat sequence
 * of checks with no closures and no allocation on the success path.
 */
export function compileValidator(schema: Schema): Validator {
    let counter = 0;

    const emit = (s: Schema, v: string, path: string): string => {
        const fail = (message: string) => `return { path: ${path}, message: ${JSON.stringify(message)} };`;
        const { min, max } = s.bounds;

        switch (s.kind) {
            case "string": {
                let code = `if (typeof ${v} !== "string") ${fail("must be a string")}\n`;
                if (min !== undefined) code += `if (${v}.length < ${min}) ${fail(`must have at least ${min} characters`)}\n`;
                if (max !== undefined) code += `if (${v}.length > ${max}) ${fail(`must have at most ${max} characters`)}\n`;
                return code;
            }
            case "integer":
            case "number": {
                let code =
                    s.kind === "integer"
                        ? `if (!Number.isInteger(${v})) ${fail("must be an integer")}\n`
                        : `if (typeof ${v} !== "number" || !Number.isFinite(${v})) ${fail("must be a number")}\n`;
                if (min !== undefined) code += `if (${v} < ${min}) ${fail(`must be >= ${min}`)}\n`;
                if (max !== undefined) code += `if (${v} > ${max}) ${fail(`must be <= ${max}`)}\n`;
                return code;
            }
            case "boolean":
                return `if (typeof ${v} !== "boolean") ${fail("must be a boolean")}\n`;
            case "object": {
                let code = `if (typeof ${v} !== "object" || ${v} === null || Array.isArray(${v})) ${fail("must be an object")}\n`;
                for (const [key, child] of Object.entries(s.shape!)) {
                    const local = `v${counter++}`;
                    const childPath = `${path} + ${JSON.stringify("." + key)}`;
                    code += `const ${local} = ${v}[${JSON.stringify(key)}];\n`;
                    if (child.optional) {
                        code += `if (${local} !== undefined) {\n${emit(child, local, childPath)}}\n`;
                    } else {
                        code += `if (${local} === undefined) return { path: ${childPath}, message: "is required" };\n`;
                        code += emit(child, local, childPath);
                    }
                }
                return code;
            }
            case "array": {
                const i = `i${counter++}`;
                const el = `e${counter++}`;
                let code = `if (!Array.isArray(${v})) ${fail("must be an array")}\n`;
                if (min !== undefined) code += `if (${v}.length < ${min}) ${fail(`must have at least ${min} items`)}\n`;
                if (max !== undefined) code += `if (${v}.length > ${max}) ${fail(`must have at most ${max} items`)}\n`;
                code += `for (let ${i} = 0; ${i} < ${v}.length; ${i}++) {\nconst ${el} = ${v}[${i}];\n`;
                code += emit(s.item!, el, `${path} + "[" + ${i} + "]"`);
                return code + "}\n";
            }
        }
    };

    const body = emit(schema, "value", `"$"`) + "return null;";
    return new Function("value", body) as Validator;
}
