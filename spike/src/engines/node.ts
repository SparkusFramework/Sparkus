import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { CompiledRoute } from "../compile.js";
import type { Ctx } from "../decorators.js";
import { HttpError } from "../errors.js";
import { parseQuery } from "../query.js";
import { Router } from "../router.js";
import { INVALID_JSON, NOT_FOUND, errorPayload, validationBody, type Serve } from "./shared.js";

type NodeHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, qs: string) => void;

const JSON_TYPE = "application/json; charset=utf-8";
const BODY_LIMIT = 1024 * 1024;
const NOT_FOUND_TEXT = JSON.stringify(NOT_FOUND);
const INVALID_JSON_TEXT = JSON.stringify(INVALID_JSON);

class NodeCtx implements Ctx<any> {
    private parsedQuery: Record<string, string | undefined> | undefined;

    constructor(
        private readonly req: IncomingMessage,
        readonly params: Record<string, string>,
        private readonly qs: string,
        readonly body: any,
    ) {}

    get query(): Record<string, string | undefined> {
        return (this.parsedQuery ??= parseQuery(this.qs));
    }

    header(name: string): string | undefined {
        const value = this.req.headers[name.toLowerCase()];
        return Array.isArray(value) ? value.join(", ") : value;
    }
}

function send(res: ServerResponse, status: number, payload: string): void {
    res.writeHead(status, { "content-type": JSON_TYPE, "content-length": Buffer.byteLength(payload) });
    res.end(payload);
}

function respond(res: ServerResponse, value: unknown, status: number): void {
    if (value === undefined) {
        res.writeHead(204);
        res.end();
        return;
    }
    send(res, status, JSON.stringify(value));
}

function fail(res: ServerResponse, error: unknown): void {
    const { status, body } = errorPayload(error);
    send(res, status, JSON.stringify(body));
}

function readBody(req: IncomingMessage, done: (tooLarge: boolean, text: string) => void): void {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;

    req.on("data", (chunk: Buffer) => {
        if (aborted) return;
        size += chunk.length;
        if (size > BODY_LIMIT) {
            aborted = true;
            done(true, "");
            return;
        }
        chunks.push(chunk);
    });
    req.on("end", () => {
        if (aborted) return;
        done(false, chunks.length === 1 ? chunks[0]!.toString("utf8") : Buffer.concat(chunks).toString("utf8"));
    });
}

function createHandler(route: CompiledRoute): NodeHandler {
    const { invoke, validate, status } = route;

    const run = (res: ServerResponse, ctx: NodeCtx): void => {
        let out: unknown;
        try {
            out = invoke(ctx);
        } catch (error) {
            return fail(res, error);
        }
        if (out instanceof Promise) {
            out.then(
                (value) => respond(res, value, status),
                (error) => fail(res, error),
            );
        } else {
            respond(res, out, status);
        }
    };

    if (validate === null) {
        return (req, res, params, qs) => run(res, new NodeCtx(req, params, qs, undefined));
    }

    return (req, res, params, qs) =>
        readBody(req, (tooLarge, text) => {
            if (tooLarge) return fail(res, new HttpError(413, "Payload Too Large"));

            let body: unknown;
            try {
                body = JSON.parse(text);
            } catch {
                return send(res, 400, INVALID_JSON_TEXT);
            }

            const issue = validate(body);
            if (issue !== null) return send(res, 400, JSON.stringify(validationBody(issue)));

            run(res, new NodeCtx(req, params, qs, body));
        });
}

export const serve: Serve = (routes, { port, hostname }) => {
    const router = new Router<NodeHandler>();
    for (const route of routes) router.add(route.method, route.path, createHandler(route));

    const server = createServer((req, res) => {
        const url = req.url!;
        const index = url.indexOf("?");
        const match = router.find(req.method!, index === -1 ? url : url.slice(0, index));
        if (match === null) return send(res, 404, NOT_FOUND_TEXT);
        match.handler(req, res, match.params, index === -1 ? "" : url.slice(index + 1));
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
            resolve({
                engine: "node",
                port: (server.address() as AddressInfo).port,
                stop: () => new Promise<void>((done) => server.close(() => done())),
            });
        });
    });
};
