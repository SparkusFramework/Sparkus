// Ceiling for the Node runtime: node:http with no framework.
import { createServer } from "node:http";
import { HOST, PORT, findUser, isValidUser } from "../shared.js";

function json(res, status, value) {
    const payload = JSON.stringify(value);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
    res.end(payload);
}

createServer((req, res) => {
    const url = req.url;
    const q = url.indexOf("?");
    const path = q === -1 ? url : url.slice(0, q);

    if (req.method === "GET" && path === "/") return json(res, 200, { hello: "world" });

    if (req.method === "GET" && path.startsWith("/users/")) {
        const fields = q === -1 ? null : new URLSearchParams(url.slice(q + 1)).get("fields");
        return json(res, 200, { ...findUser(path.slice(7)), fields });
    }

    if (req.method === "POST" && path === "/users") {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            let body;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
                return json(res, 400, { error: "Bad Request" });
            }
            if (!isValidUser(body)) return json(res, 400, { error: "Bad Request" });
            json(res, 201, { id: 1, name: body.name, age: body.age });
        });
        return;
    }

    json(res, 404, { error: "Not Found" });
}).listen(PORT, HOST);
