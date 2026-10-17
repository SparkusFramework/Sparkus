import { ErrorCode, HttpError, SparkusError } from "./errors.js";
import type { Issue, Schema } from "./schema.js";

/**
 * Path parameters and query values arrive as strings. A route can declare
 * their types with a flat object schema; this module compiles it into one
 * function that converts and validates every field, then returns an object
 * of a fixed shape:
 *
 *     { params: t.object({ id: t.integer({ min: 1 }) }) }   ->   ctx.params.id is a number
 */
export type Coercer = (raw: Readonly<Record<string, string | undefined>>) => Record<string, unknown>;

export type Source = "params" | "query";

const SCALARS = new Set(["string", "integer", "number", "boolean"]);

export function invalidRequest(source: Source, issue: Issue): HttpError {
    // issue.path is "query.page": the detail names the parameter as the client wrote it.
    const name = issue.path.slice(source.length + 1);
    const kind = source === "params" ? "path" : "query";
    return new HttpError(400, `Invalid ${kind} parameter "${name}": ${issue.message}.`, {
        code: ErrorCode.ValidationFailed,
        extensions: { issues: [issue] },
    });
}

function invalidSchema(where: string, source: Source, reason: string): SparkusError {
    return new SparkusError(ErrorCode.InvalidRouteSchema, `${where}: ${source} schema ${reason}.`);
}

/**
 * Checks a params or query schema at startup. Params must name exactly the
 * path's parameters, all required; every field must be a string, integer,
 * number or boolean.
 */
export function checkSchema(schema: Schema, source: Source, where: string, pathParams: readonly string[]): void {
    if (schema.kind !== "object" || schema.shape === undefined) {
        const fields = source === "params" ? " with one field per path parameter" : "";
        throw invalidSchema(where, source, `must be t.object({ ... })${fields}`);
    }
    for (const [key, field] of Object.entries(schema.shape)) {
        if (!SCALARS.has(field.kind)) {
            const use = "use t.string(), t.integer(), t.number() or t.boolean()";
            throw invalidSchema(where, source, `field "${key}" is t.${field.kind}(); ${use}`);
        }
        if (source === "params" && field.optional) {
            const reason = `field "${key}" is optional, but path parameters are always present`;
            throw invalidSchema(where, source, `${reason}. Remove t.optional()`);
        }
    }
    if (source === "params") {
        const fields = Object.keys(schema.shape);
        if (fields.length !== pathParams.length || fields.some((field) => !pathParams.includes(field))) {
            const has = fields.length === 0 ? "no fields" : `fields ${fields.join(", ")}`;
            const path = pathParams.length === 0 ? "no parameters" : pathParams.map((name) => `:${name}`).join(", ");
            throw invalidSchema(where, source, `has ${has} but the path has ${path}. Use the same names in both`);
        }
    }
}

/** Compiles a checked params or query schema into a coercer. */
export function compileCoercer(schema: Schema, source: Source): Coercer {
    const shape = schema.shape!;
    const keys = Object.keys(shape);
    let code = "";

    keys.forEach((key, i) => {
        const field = shape[key]!;
        const raw = `raw[${JSON.stringify(key)}]`;
        const out = `v${i}`;
        const path = JSON.stringify(`${source}.${key}`);
        const fail = (message: string) => `throw invalid({ path: ${path}, message: ${JSON.stringify(message)} });`;
        const { min, max } = field.bounds;

        code += `let ${out} = ${raw};\n`;
        code += field.optional ? `if (${out} !== undefined) {\n` : `if (${out} === undefined) ${fail("is required")}\n{\n`;
        switch (field.kind) {
            case "string":
                if (min !== undefined) code += `if (${out}.length < ${min}) ${fail(`must have at least ${min} characters`)}\n`;
                if (max !== undefined) code += `if (${out}.length > ${max}) ${fail(`must have at most ${max} characters`)}\n`;
                break;
            case "integer":
                code += `if (!INTEGER.test(${out})) ${fail("must be an integer")}\n`;
                code += `${out} = Number(${out});\n`;
                code += `if (!Number.isSafeInteger(${out})) ${fail("must be a safe integer")}\n`;
                break;
            case "number":
                code += `if (!NUMBER.test(${out})) ${fail("must be a number")}\n`;
                code += `${out} = Number(${out});\n`;
                break;
            case "boolean":
                code += `if (${out} === "true" || ${out} === "1") ${out} = true;\n`;
                code += `else if (${out} === "false" || ${out} === "0") ${out} = false;\n`;
                code += `else ${fail('must be "true", "false", "1" or "0"')}\n`;
                break;
        }
        if (field.kind === "integer" || field.kind === "number") {
            if (min !== undefined) code += `if (${out} < ${min}) ${fail(`must be >= ${min}`)}\n`;
            if (max !== undefined) code += `if (${out} > ${max}) ${fail(`must be <= ${max}`)}\n`;
        }
        code += "}\n";
    });

    // One object literal: every result of a route has the same shape.
    code += `return { ${keys.map((key, i) => `${JSON.stringify(key)}: v${i}`).join(", ")} };`;

    const invalid = (issue: Issue) => invalidRequest(source, issue);
    return new Function("invalid", "INTEGER", "NUMBER", `return function coerce(raw) {\n${code}\n};`)(
        invalid,
        /^-?\d+$/,
        /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i,
    ) as Coercer;
}
