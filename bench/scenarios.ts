export interface Scenario {
    name: string;
    description: string;
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    expect: { status: number; body: unknown };
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

/** Checked before measuring, not benchmarked. Elysia answers 422 by design. */
export const invalidBody = {
    path: "/users",
    body: { name: "", age: -1 },
    statuses: [400, 422],
};
