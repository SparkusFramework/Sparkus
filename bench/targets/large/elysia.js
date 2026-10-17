import { Elysia, t } from "elysia";
import { HOST, PORT, RESOURCES, report } from "./routes.js";

const t0 = performance.now();
let app = new Elysia().get("/", () => ({ hello: "world" }));
for (let n = 0; n < RESOURCES; n++) {
    const body = t.Object({ name: t.String({ minLength: 1, maxLength: 100 }), age: t.Integer({ minimum: 0, maximum: 150 }) });
    app = app
        .get(`/r${n}`, () => [])
        .get(`/r${n}/:id`, ({ params }) => ({ id: params.id, n }))
        .post(`/r${n}`, ({ body, set }) => {
            set.status = 201;
            return { id: 1, ...body };
        }, { body })
        .put(`/r${n}/:id`, ({ params, body }) => ({ id: params.id, ...body }), { body })
        .delete(`/r${n}/:id`, ({ set }) => {
            set.status = 204;
        });
}
const t1 = performance.now();
app.listen({ port: PORT, hostname: HOST });
report({ declare: t1 - t0, init: 0, listen: performance.now() - t1 });
