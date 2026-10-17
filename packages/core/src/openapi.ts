import type { CompiledRoute } from "./compile.js";
import type { AnySchema, Schema } from "./schema.js";
import { isStandardSchema, standardJsonSchema } from "./standard.js";

export interface OpenApiOptions {
    title?: string;
    version?: string;
    description?: string;
    servers?: Array<{ url: string; description?: string }>;
}

type JsonSchema = Record<string, unknown>;

/** Converts a `t` schema to JSON Schema (draft 2020-12, as used by OpenAPI 3.1). */
export function toJsonSchema(schema: Schema): JsonSchema {
    const json = typeJsonSchema(schema);
    // 2020-12 spells nullable as a type list: { "type": ["string", "null"] }.
    return schema.nullable === true ? { ...json, type: [json.type, "null"] } : json;
}

function typeJsonSchema(schema: Schema): JsonSchema {
    const { min, max } = schema.bounds;
    switch (schema.kind) {
        case "string":
            return { type: "string", ...(min !== undefined && { minLength: min }), ...(max !== undefined && { maxLength: max }) };
        case "integer":
        case "number":
            return { type: schema.kind, ...(min !== undefined && { minimum: min }), ...(max !== undefined && { maximum: max }) };
        case "boolean":
            return { type: "boolean" };
        case "array":
            return {
                type: "array",
                items: toJsonSchema(schema.item!),
                ...(min !== undefined && { minItems: min }),
                ...(max !== undefined && { maxItems: max }),
            };
        case "object": {
            const entries = Object.entries(schema.shape!);
            const required = entries.filter(([, field]) => !field.optional).map(([key]) => key);
            return {
                type: "object",
                properties: Object.fromEntries(entries.map(([key, field]) => [key, toJsonSchema(field)])),
                ...(required.length > 0 && { required }),
            };
        }
    }
}

/**
 * JSON Schema of a route schema: always for `t` schemas, for a Standard Schema when its
 * library implements Standard JSON Schema (Zod 4 does). Undefined otherwise.
 */
function jsonSchemaOf(schema: AnySchema, io: "input" | "output"): JsonSchema | undefined {
    return isStandardSchema(schema) ? standardJsonSchema(schema, io) : toJsonSchema(schema);
}

const PROBLEM = {
    description: "Error (RFC 9457 problem details). `code` identifies it: SPKxxxx for Sparkus errors, or your own.",
    content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
};

/**
 * OpenAPI 3.1 description of the compiled routes: paths, typed path and
 * query parameters, JSON request bodies, the success status and the
 * problem+json error shape, and the success body when the route declares
 * a response schema.
 */
export function generateOpenApi(routes: readonly CompiledRoute[], options: OpenApiOptions = {}): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const route of routes) {
        const path = route.path.replace(/:([A-Za-z_$][\w$]*)/g, "{$1}");
        const parameters: unknown[] = [];

        const paramFields = (route.params && jsonSchemaOf(route.params, "input"))?.properties as Record<string, JsonSchema> | undefined;
        for (const name of route.paramNames) {
            parameters.push({ name, in: "path", required: true, schema: paramFields?.[name] ?? { type: "string" } });
        }
        const query = route.query && jsonSchemaOf(route.query, "input");
        const requiredQuery = new Set((query?.required as string[] | undefined) ?? []);
        for (const [name, field] of Object.entries((query?.properties as Record<string, JsonSchema> | undefined) ?? {})) {
            parameters.push({ name, in: "query", required: requiredQuery.has(name), schema: field });
        }

        const success = String(route.status);
        const operation: Record<string, unknown> = {
            operationId: route.handlerName,
            ...(parameters.length > 0 && { parameters }),
            ...(route.body !== undefined && {
                requestBody: { required: true, content: { "application/json": { schema: jsonSchemaOf(route.body, "input") ?? {} } } },
            }),
            responses: {
                [success]: {
                    description: successText(route.status),
                    ...(route.response !== undefined && {
                        content: { "application/json": { schema: jsonSchemaOf(route.response, "output") ?? {} } },
                    }),
                },
                default: PROBLEM,
            },
        };
        (paths[path] ??= {})[route.method.toLowerCase()] = operation;
    }

    return {
        openapi: "3.1.0",
        info: {
            title: options.title ?? "API",
            version: options.version ?? "1.0.0",
            ...(options.description !== undefined && { description: options.description }),
        },
        ...(options.servers !== undefined && { servers: options.servers }),
        paths,
        components: {
            schemas: {
                Problem: {
                    type: "object",
                    required: ["type", "title", "status"],
                    properties: {
                        type: { type: "string" },
                        title: { type: "string" },
                        status: { type: "integer" },
                        detail: { type: "string" },
                        code: { type: "string" },
                        issues: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: { path: { type: "string" }, message: { type: "string" } },
                            },
                        },
                    },
                },
            },
        },
    };
}

function successText(status: number): string {
    switch (status) {
        case 200:
            return "OK";
        case 201:
            return "Created";
        case 202:
            return "Accepted";
        case 204:
            return "No Content";
        default:
            return "Success";
    }
}
