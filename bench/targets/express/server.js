// Express 5 with default settings, Zod for validation.
import express from "express";
import { z } from "zod";
import { HOST, PORT, findUser } from "../shared.js";

const CreateUser = z.object({
    name: z.string().min(1).max(100),
    age: z.number().int().min(0).max(150),
});

const app = express();

app.get("/", (req, res) => {
    res.json({ hello: "world" });
});

app.get("/users/:id", (req, res) => {
    res.json({ ...findUser(req.params.id), fields: req.query.fields ?? null });
});

app.post("/users", express.json(), (req, res) => {
    const result = CreateUser.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: "Bad Request" });
    res.status(201).json({ id: 1, name: result.data.name, age: result.data.age });
});

app.listen(PORT, HOST);
