// Ceiling for the Bun runtime: Bun.serve with native routes and no framework.
import { HOST, PORT, findUser, isValidUser } from "../shared.js";

Bun.serve({
    port: PORT,
    hostname: HOST,
    routes: {
        "/": { GET: () => Response.json({ hello: "world" }) },
        "/users/:id": {
            GET: (req) => {
                const url = req.url;
                const q = url.indexOf("?");
                const fields = q === -1 ? null : new URLSearchParams(url.slice(q + 1)).get("fields");
                return Response.json({ ...findUser(req.params.id), fields });
            },
        },
        "/users": {
            POST: async (req) => {
                let body;
                try {
                    body = await req.json();
                } catch {
                    return Response.json({ error: "Bad Request" }, { status: 400 });
                }
                if (!isValidUser(body)) return Response.json({ error: "Bad Request" }, { status: 400 });
                return Response.json({ id: 1, name: body.name, age: body.age }, { status: 201 });
            },
        },
    },
    fetch: () => Response.json({ error: "Not Found" }, { status: 404 }),
});
