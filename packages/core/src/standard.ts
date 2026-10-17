/**
 * Standard Schema (https://standardschema.dev): the interface Zod, Valibot,
 * ArkType and others implement. A route may use one of their schemas where it
 * takes a `t` schema. This is the secondary path: `t` schemas are compiled to
 * straight-line code, a Standard Schema runs its library's `validate()`.
 *
 * The types are copied from the spec, as it recommends: no dependency (D9).
 */
import { ErrorCode, SparkusError } from "./errors.js";
import type { Issue } from "./schema.js";

/** The Standard Schema interface (v1). */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
    interface Props<Input = unknown, Output = Input> {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: unknown, options?: Options | undefined) => Result<Output> | Promise<Result<Output>>;
        readonly types?: Types<Input, Output> | undefined;
        /** Standard JSON Schema (optional): used for OpenAPI when the library provides it. */
        readonly jsonSchema?: JsonSchemaConverter | undefined;
    }
    type Result<Output> = SuccessResult<Output> | FailureResult;
    interface SuccessResult<Output> {
        readonly value: Output;
        readonly issues?: undefined;
    }
    interface Options {
        readonly libraryOptions?: Record<string, unknown> | undefined;
    }
    interface FailureResult {
        readonly issues: ReadonlyArray<Issue>;
    }
    interface Issue {
        readonly message: string;
        readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
    }
    interface PathSegment {
        readonly key: PropertyKey;
    }
    interface Types<Input = unknown, Output = Input> {
        readonly input: Input;
        readonly output: Output;
    }
    interface JsonSchemaConverter {
        readonly input: (options: { readonly target: string }) => Record<string, unknown>;
        readonly output: (options: { readonly target: string }) => Record<string, unknown>;
    }
    type InferInput<S extends StandardSchemaV1> = NonNullable<S["~standard"]["types"]>["input"];
    type InferOutput<S extends StandardSchemaV1> = NonNullable<S["~standard"]["types"]>["output"];
}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
    return typeof value === "object" && value !== null && "~standard" in value;
}

/** Startup check: a Standard Schema must expose a v1 `validate()`. */
export function checkStandardSchema(schema: StandardSchemaV1, where: string, source: string): void {
    const props = schema["~standard"];
    if (typeof props !== "object" || props === null || props.version !== 1 || typeof props.validate !== "function") {
        throw new SparkusError(
            ErrorCode.InvalidRouteSchema,
            `${where}: ${source} schema has a "~standard" property but no Standard Schema v1 validate(). ` +
                "Use a t schema, or a schema from a library that implements Standard Schema v1 (Zod 3.24+, Valibot 1, ArkType 2).",
        );
    }
}

/** First issue in Sparkus' shape: `{ path: "$.address.city", message }`. */
function firstIssue(issues: ReadonlyArray<StandardSchemaV1.Issue>, root: string): Issue {
    const issue = issues[0]!;
    let path = root;
    for (const segment of issue.path ?? []) {
        const key = typeof segment === "object" ? segment.key : segment;
        path += typeof key === "number" ? `[${key}]` : `.${String(key)}`;
    }
    return { path, message: issue.message };
}

/**
 * Validates with the library and returns its output (a Promise when the library
 * validates asynchronously). `root` starts issue paths: "$" for a body,
 * "params" or "query" for parameters.
 */
export function compileStandardInput(
    schema: StandardSchemaV1,
    root: string,
    invalid: (issue: Issue) => Error,
): (value: unknown) => unknown {
    const validate = schema["~standard"].validate;
    const settle = (result: StandardSchemaV1.Result<unknown>) => {
        if (result.issues !== undefined) throw invalid(firstIssue(result.issues, root));
        return result.value;
    };
    return (value) => {
        const result = validate(value);
        return result instanceof Promise ? result.then(settle) : settle(result);
    };
}

/**
 * Response: what is sent is the schema's output. Undeclared fields are dropped
 * when the library drops them (Zod and Valibot objects do; ArkType needs
 * `"+": "delete"`). A value the schema rejects answers 500 SPK5001.
 */
export function compileStandardProjector(schema: StandardSchemaV1, where: string): (value: unknown) => unknown {
    const mismatch = (issue: Issue) =>
        new SparkusError(
            ErrorCode.ResponseMismatch,
            `${where} returned a value that does not match its response schema: ${issue.path} ${issue.message}. ` +
                "Return what the schema declares, or fix the schema.",
        );
    const validate = compileStandardInput(schema, "$", mismatch);
    return (value) => (value instanceof Response ? value : validate(value));
}

/** JSON Schema of a Standard Schema's input or output, when its library implements Standard JSON Schema. */
export function standardJsonSchema(schema: StandardSchemaV1, io: "input" | "output"): Record<string, unknown> | undefined {
    const converter = schema["~standard"].jsonSchema;
    if (converter === undefined) return undefined;
    try {
        const { $schema: _, ...json } = converter[io]({ target: "draft-2020-12" });
        return json;
    } catch {
        // The library cannot express this schema in JSON Schema (a transform, a custom check).
        return undefined;
    }
}
