import Fastify from "fastify";
import { HOST, PORT, RESOURCES, report } from "./routes.js";

const t0 = performance.now();
const app = Fastify({ logger: false });
const body = {
    type: "object",
    required: ["name", "age"],
    properties: { name: { type: "string", minLength: 1, maxLength: 100 }, age: { type: "integer", minimum: 0, maximum: 150 } },
};
app.get("/", async () => ({ hello: "world" }));
for (let n = 0; n < RESOURCES; n++) {
    app.get(`/r${n}`, async () => []);
    app.get(`/r${n}/:id`, async (req) => ({ id: req.params.id, n }));
    app.post(`/r${n}`, { schema: { body } }, async (req, reply) => {
        reply.code(201);
        return { id: 1, ...req.body };
    });
    app.put(`/r${n}/:id`, { schema: { body } }, async (req) => ({ id: req.params.id, ...req.body }));
    app.delete(`/r${n}/:id`, async (req, reply) => reply.code(204).send());
}
const t1 = performance.now();
await app.listen({ port: PORT, host: HOST });
report({ declare: t1 - t0, init: 0, listen: performance.now() - t1 });
