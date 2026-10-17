// Idiomatic Fastify: JSON Schema validation (ajv) and response schemas
// (fast-json-stringify), which is how Fastify is meant to be run fast.
import Fastify from "fastify";
import { HOST, PORT, findUser } from "../shared.js";

// FASTIFY_LOGGER=1 (target fastify-logger): pino on stdout, Fastify's production logging.
const app = Fastify({ logger: process.env.FASTIFY_LOGGER === "1" });

app.get(
    "/",
    { schema: { response: { 200: { type: "object", properties: { hello: { type: "string" } } } } } },
    async () => ({ hello: "world" }),
);

app.get(
    "/users/:id",
    {
        schema: {
            response: {
                200: {
                    type: "object",
                    properties: { id: { type: "string" }, name: { type: "string" }, fields: { type: ["string", "null"] } },
                },
            },
        },
    },
    async (req) => ({ ...findUser(req.params.id), fields: req.query.fields ?? null }),
);

app.post(
    "/users",
    {
        schema: {
            body: {
                type: "object",
                required: ["name", "age"],
                properties: {
                    name: { type: "string", minLength: 1, maxLength: 100 },
                    age: { type: "integer", minimum: 0, maximum: 150 },
                },
            },
            response: {
                201: {
                    type: "object",
                    properties: { id: { type: "integer" }, name: { type: "string" }, age: { type: "integer" } },
                },
            },
        },
    },
    async (req, reply) => {
        reply.code(201);
        return { id: 1, name: req.body.name, age: req.body.age };
    },
);

await app.listen({ port: PORT, host: HOST });
