export interface Scenario {
    name: string;
    description: string;
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    /** `body: undefined` skips the body check and `contentType: ""` the type check (error responses differ between frameworks). */
    expect: { status: number; body: unknown; contentType?: string; statuses?: number[] };
}

export const scenarios: Scenario[] = [
    {
        name: "hello",
        description: "GET / returning a small JSON object",
        method: "GET",
        path: "/",
        expect: { status: 200, body: { hello: "world" } },
    },
    {
        name: "params-query",
        description: "GET /users/:id?fields= through a service",
        method: "GET",
        path: "/users/42?fields=name,email",
        expect: { status: 200, body: { id: "42", name: "User 42", fields: "name,email" } },
    },
    {
        name: "post-validate",
        description: "POST /users with a JSON body validated against a schema, 201",
        method: "POST",
        path: "/users",
        body: { name: "Ada", age: 36 },
        expect: { status: 201, body: { id: 1, name: "Ada", age: 36 } },
    },
];

const HELLO = { status: 200, body: { hello: "world" } };

/**
 * Run only when named with --scenarios. "pipe-*" need the sparkus-pipeline
 * targets (one route per guard/interceptor shape). "error-*" work on every
 * target: floods of requests that fail, as an attacker would send them.
 */
export const extraScenarios: Scenario[] = [
    { name: "pipe-none", description: "GET, no guard nor interceptor", method: "GET", path: "/p/none", expect: HELLO },
    { name: "pipe-guard", description: "GET, 1 sync guard", method: "GET", path: "/p/guard", expect: HELLO },
    { name: "pipe-guard-async", description: "GET, 1 async guard", method: "GET", path: "/p/guard-async", expect: HELLO },
    { name: "pipe-guards-3", description: "GET, 3 sync guards", method: "GET", path: "/p/guards-3", expect: HELLO },
    { name: "pipe-interceptor", description: "GET, 1 interceptor", method: "GET", path: "/p/interceptor", expect: HELLO },
    { name: "pipe-interceptors-3", description: "GET, 3 interceptors", method: "GET", path: "/p/interceptors-3", expect: HELLO },
    {
        name: "list",
        description: "GET /users, 10 records reduced to 4 of their 6 fields (Sparkus targets only)",
        method: "GET",
        path: "/users",
        expect: {
            status: 200,
            body: Array.from({ length: 10 }, (_, i) => ({
                id: i + 1,
                name: "User " + (i + 1),
                email: `user${i + 1}@example.com`,
                admin: i === 0,
            })),
        },
    },
    {
        name: "error-404",
        description: "GET on an unknown path (404 flood)",
        method: "GET",
        path: "/does/not/exist",
        expect: { status: 404, body: undefined, contentType: "" },
    },
    {
        name: "error-400",
        description: "POST /users with a body that fails validation (400/422 flood)",
        method: "POST",
        path: "/users",
        body: { name: "", age: -1 },
        // Elysia answers 422 by design.
        expect: { status: 400, statuses: [400, 422], body: undefined, contentType: "" },
    },
];

/** Checked before measuring, not benchmarked. Elysia answers 422 by design. */
export const invalidBody = {
    path: "/users",
    body: { name: "", age: -1 },
    statuses: [400, 422],
};
