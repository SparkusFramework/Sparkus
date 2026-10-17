import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { findUser } from "../shared.js";

const CreateUser = z.object({
    name: z.string().min(1).max(100),
    age: z.number().int().min(0).max(150),
});

export const app = new Hono()
    .get("/", (c) => c.json({ hello: "world" }))
    .get("/users/:id", (c) => c.json({ ...findUser(c.req.param("id")), fields: c.req.query("fields") ?? null }))
    .post("/users", zValidator("json", CreateUser), (c) => {
        const body = c.req.valid("json");
        return c.json({ id: 1, name: body.name, age: body.age }, 201);
    });
