import { Elysia, t } from "elysia";
// @ts-ignore: plain JS helper shared by every target.
import { HOST, PORT, findUser } from "../shared.js";

new Elysia()
    .get("/", () => ({ hello: "world" }))
    .get("/users/:id", ({ params, query }) => ({ ...findUser(params.id), fields: query.fields ?? null }))
    .post(
        "/users",
        ({ body, set }) => {
            set.status = 201;
            return { id: 1, name: body.name, age: body.age };
        },
        {
            body: t.Object({
                name: t.String({ minLength: 1, maxLength: 100 }),
                age: t.Integer({ minimum: 0, maximum: 150 }),
            }),
        },
    )
    .listen({ port: PORT, hostname: HOST });
