/**
 * Generates a typed TypeScript client from the app's OpenAPI document (the
 * one `app.openapi()` builds from the route schemas, `t` or Standard Schema).
 * The output is one dependency-free file: `createClient({ baseUrl })` returns
 * one method per route, grouped by controller:
 *
 *     const api = createClient({ baseUrl: "https://api.example.com" });
 *     const user = await api.user.get({ params: { id: 42 } });   // typed from the response schema
 */

type JsonSchema = Record<string, unknown>;

interface Parameter {
    name: string;
    in: string;
    required?: boolean;
    schema?: JsonSchema;
}

interface Operation {
    operationId?: string;
    parameters?: Parameter[];
    requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
    responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }>;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const METHODS = ["get", "head", "post", "put", "patch", "delete", "options"];

const key = (name: string) => (IDENTIFIER.test(name) ? name : JSON.stringify(name));

/** TypeScript type of a JSON Schema (the subset route schemas produce). Anything else is `unknown`. */
export function tsType(schema: JsonSchema | undefined, indent = ""): string {
    if (schema === undefined) return "unknown";
    if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(" | ") || "never";
    if ("const" in schema) return JSON.stringify(schema.const);
    for (const combinator of ["anyOf", "oneOf"] as const) {
        const options = schema[combinator];
        if (Array.isArray(options)) return union(options.map((option) => tsType(option as JsonSchema, indent)));
    }
    if (Array.isArray(schema.allOf)) return schema.allOf.map((part) => wrap(tsType(part as JsonSchema, indent))).join(" & ");
    const type = schema.type;
    if (Array.isArray(type)) return union(type.map((t) => tsType({ ...schema, type: t }, indent)));
    switch (type) {
        case "string":
            return "string";
        case "integer":
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "null":
            return "null";
        case "array":
            return `${wrap(tsType(schema.items as JsonSchema | undefined, indent))}[]`;
        case "object":
            return objectType(schema, indent);
    }
    return schema.properties !== undefined ? objectType(schema, indent) : "unknown";
}

function union(types: string[]): string {
    return [...new Set(types)].join(" | ");
}

function wrap(type: string): string {
    return /[|&]/.test(type) && !type.startsWith("{") ? `(${type})` : type;
}

function objectType(schema: JsonSchema, indent: string): string {
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set((schema.required as string[] | undefined) ?? []);
    const names = Object.keys(properties);
    const extra = schema.additionalProperties;
    if (names.length === 0) {
        if (extra === false) return "Record<string, never>";
        return `Record<string, ${typeof extra === "object" && extra !== null ? tsType(extra as JsonSchema, indent) : "unknown"}>`;
    }
    const inner = indent + "    ";
    const fields = names.map((name) => `${key(name)}${required.has(name) ? "" : "?"}: ${tsType(properties[name], inner)}`);
    const inline = `{ ${fields.join("; ")} }`;
    if (inline.length + indent.length <= 100 && !inline.includes("\n")) return inline;
    return `{\n${fields.map((field) => `${inner}${field};`).join("\n")}\n${indent}}`;
}

function lowerFirst(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1);
}

interface Method {
    group: string;
    controller: string;
    name: string;
    code: string;
}

/** `UserController.get` -> group "user", method "get". Without an operationId, the path names the method. */
function names(operation: Operation, method: string, path: string): { controller: string; name: string } {
    const id = operation.operationId ?? "";
    const dot = id.lastIndexOf(".");
    if (dot > 0) return { controller: id.slice(0, dot), name: id.slice(dot + 1) };
    const words = path.split(/[^A-Za-z0-9]+/).filter(Boolean);
    return { controller: "Api", name: method + words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("") };
}

function jsonSchemaOf(content: Record<string, { schema?: JsonSchema }> | undefined): JsonSchema | undefined {
    if (content === undefined) return undefined;
    const json = content["application/json"] ?? Object.values(content)[0];
    return json?.schema;
}

function generateMethod(method: string, path: string, operation: Operation, indent: string): { controller: string; name: string; code: string } {
    const { controller, name } = names(operation, method, path);
    const parameters = operation.parameters ?? [];
    const pathParams = parameters.filter((p) => p.in === "path");
    const queryParams = parameters.filter((p) => p.in === "query");
    const body = operation.requestBody === undefined ? undefined : jsonSchemaOf(operation.requestBody.content);
    const inner = indent + "    ";

    const input: string[] = [];
    if (pathParams.length > 0) {
        input.push(`params: { ${pathParams.map((p) => `${key(p.name)}: ${tsType(p.schema, inner)}`).join("; ")} }`);
    }
    if (queryParams.length > 0) {
        const fields = queryParams.map((p) => `${key(p.name)}${p.required ? "" : "?"}: ${tsType(p.schema, inner)}`);
        input.push(`query${queryParams.some((p) => p.required) ? "" : "?"}: { ${fields.join("; ")} }`);
    }
    if (operation.requestBody !== undefined) input.push(`body: ${tsType(body ?? {}, inner)}`);
    const optional = pathParams.length === 0 && operation.requestBody === undefined && !queryParams.some((p) => p.required);
    const inputType = input.length === 0 ? "{}" : `{ ${input.join("; ")} }`;

    const statuses = Object.keys(operation.responses ?? {}).filter((status) => /^2\d\d$/.test(status));
    const success = statuses[0];
    const response = success === undefined ? undefined : operation.responses![success];
    const result = success === "204" ? "undefined" : response?.content === undefined ? "unknown" : tsType(jsonSchemaOf(response.content), indent);

    // `/users/:id` with params.id -> `/users/${encodeURIComponent(String(input.params.id))}`
    const url = path.replace(/\{([^}]+)\}/g, (_, param: string) => `\${encodeURIComponent(String(input.params${IDENTIFIER.test(param) ? "." + param : `[${JSON.stringify(param)}]`}))}`);
    const call = `call(options, ${JSON.stringify(method.toUpperCase())}, \`${url.replace(/`/g, "\\`")}\`, ${queryParams.length > 0 ? "input.query" : "undefined"}, ${operation.requestBody !== undefined ? "input.body" : "undefined"}, init)`;
    const doc = `${indent}/** ${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/g, ":$1")}${operation.operationId ? ` (${operation.operationId})` : ""} */`;
    const param = input.length === 0 ? "_input" : "input";
    const signature = `(${param}: ${inputType}${optional ? " = {}" : ""}, init?: CallOptions): Promise<${result}> =>`;
    return { controller, name, code: `${doc}\n${indent}${key(name)}: ${signature}\n${inner}${call},` };
}

const RUNTIME = `/** Error answered by the API (RFC 9457 problem details). \`code\` is an SPKxxxx code or the app's own. */
export interface Problem {
    type: string;
    title: string;
    status: number;
    detail?: string;
    code?: string;
    [extension: string]: unknown;
}

/** Thrown for every response outside 2xx. */
export class ApiError extends Error {
    readonly status: number;
    readonly code: string | undefined;
    readonly problem: Problem;

    constructor(problem: Problem) {
        super(problem.detail ?? problem.title);
        this.name = "ApiError";
        this.status = problem.status;
        this.code = problem.code;
        this.problem = problem;
    }
}

export interface ClientOptions {
    /** Base URL of the API: "https://api.example.com". */
    baseUrl: string;
    /** Headers sent with every request (authorization...). A function is called before each request. */
    headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
    /** Sends the request. Defaults to the global fetch; pass \`(request) => app.fetch(request)\` in tests. */
    fetch?: (request: Request) => Promise<Response>;
}

export interface CallOptions {
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

type QueryValues = Record<string, string | number | boolean | undefined>;

async function call(
    options: ClientOptions,
    method: string,
    path: string,
    query: QueryValues | undefined,
    body: unknown,
    init: CallOptions | undefined,
): Promise<any> {
    let url = options.baseUrl.replace(/\\/+$/, "") + path;
    if (query !== undefined) {
        const search = new URLSearchParams();
        for (const name in query) {
            const value = query[name];
            if (value !== undefined) search.append(name, String(value));
        }
        const text = search.toString();
        if (text.length > 0) url += "?" + text;
    }
    const shared = typeof options.headers === "function" ? await options.headers() : options.headers;
    const headers: Record<string, string> = { ...shared, ...init?.headers };
    if (body !== undefined) headers["content-type"] = "application/json";
    const request = new Request(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: init?.signal,
    });
    const response = await (options.fetch ?? fetch)(request);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok) {
        const problem: Problem = type.includes("json")
            ? ((await response.json()) as Problem)
            : { type: "about:blank", title: response.statusText || "Error", status: response.status, detail: await response.text() };
        throw new ApiError(problem);
    }
    if (response.status === 204 || method === "HEAD") return undefined;
    if (type.includes("json")) return response.json();
    if (type.startsWith("text/")) return response.text();
    return new Uint8Array(await response.arrayBuffer());
}
`;

/** One dependency-free TypeScript file with `createClient()`, `Client`, `ApiError` and `Problem`. */
export function generateClient(doc: Record<string, unknown>): { code: string; routes: number } {
    const paths = (doc.paths ?? {}) as Record<string, Record<string, Operation>>;
    const methods: Method[] = [];
    for (const [path, item] of Object.entries(paths)) {
        for (const method of METHODS) {
            const operation = item[method];
            if (operation === undefined) continue;
            const generated = generateMethod(method, path, operation, "            ");
            methods.push({ ...generated, group: lowerFirst(generated.controller.replace(/Controller$/, "") || generated.controller) });
        }
    }

    // Two controllers that shorten to the same group keep their full names.
    const owners = new Map<string, Set<string>>();
    for (const m of methods) (owners.get(m.group) ?? owners.set(m.group, new Set()).get(m.group)!).add(m.controller);
    for (const m of methods) if (owners.get(m.group)!.size > 1) m.group = lowerFirst(m.controller);

    const groups = new Map<string, Method[]>();
    for (const m of methods) (groups.get(m.group) ?? groups.set(m.group, []).get(m.group)!).push(m);
    const body = [...groups].map(([group, list]) => `        ${key(group)}: {\n${list.map((m) => m.code).join("\n")}\n        },`);

    const info = (doc.info ?? {}) as { title?: string; version?: string };
    const code = [
        `// Generated by \`sparkus client\` from the route schemas${info.title ? ` of ${info.title}` : ""}. Do not edit: run it again after changing a route.`,
        "",
        RUNTIME,
        "/** One method per route, grouped by controller: `api.user.get({ params: { id: 42 } })`. */",
        "export function createClient(options: ClientOptions) {",
        "    return {",
        ...body,
        "    };",
        "}",
        "",
        "export type Client = ReturnType<typeof createClient>;",
        "",
    ].join("\n");
    return { code, routes: methods.length };
}
