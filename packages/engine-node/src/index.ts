import { createServer, type IncomingMessage, type ServerOptions, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
    Router,
    isJsonContentType,
    malformedJson,
    parseQuery,
    payloadTooLarge,
    unsupportedMediaType,
    type AppRuntime,
    type CompiledRoute,
    type Engine,
    type EngineServer,
    type RenderedError,
    type RequestContext,
} from "@sparkus/core";

type Params = Readonly<Record<string, string>>;
type NodeHandler = (req: IncomingMessage, res: ServerResponse, params: Params, path: string, rawQuery: string) => void;

const JSON_TYPE = "application/json; charset=utf-8";
const TEXT_TYPE = "text/plain; charset=utf-8";
const BINARY_TYPE = "application/octet-stream";

class NodeContext implements RequestContext {
    body: any = undefined;
    responseHeaders: Record<string, string> | null = null;
    private parsedQuery: Record<string, any> | undefined = undefined;
    private store: Record<string, unknown> | undefined = undefined;

    constructor(
        readonly req: IncomingMessage,
        readonly path: string,
        public params: Readonly<Record<string, any>>,
        private readonly rawQuery: string,
        public status: number,
    ) {}

    get method(): string {
        return this.req.method!;
    }

    set query(value: Record<string, any>) {
        this.parsedQuery = value;
    }

    get query(): Record<string, any> {
        return (this.parsedQuery ??= parseQuery(this.rawQuery));
    }

    get state(): Record<string, unknown> {
        return (this.store ??= {});
    }

    header(name: string): string | undefined {
        const value = this.req.headers[name.toLowerCase()];
        return typeof value === "string" ? value : value === undefined ? undefined : value.join(", ");
    }

    setHeader(name: string, value: string): void {
        (this.responseHeaders ??= {})[name.toLowerCase()] = value;
    }

    readBody(limit: number): Promise<unknown> {
        const req = this.req;
        const type = req.headers["content-type"];
        if (!isJsonContentType(type)) return Promise.reject(unsupportedMediaType(type));
        const declared = req.headers["content-length"];
        if (declared !== undefined && Number(declared) > limit) return Promise.reject(payloadTooLarge(limit));

        return new Promise((resolve, reject) => {
            let first: Buffer | undefined;
            let rest: Buffer[] | undefined;
            let size = 0;
            const onData = (chunk: Buffer) => {
                size += chunk.length;
                if (size > limit) {
                    req.off("data", onData);
                    req.off("end", onEnd);
                    reject(payloadTooLarge(limit));
                    return;
                }
                if (first === undefined) first = chunk;
                else (rest ??= [first]).push(chunk);
            };
            const onEnd = () => {
                const text =
                    first === undefined ? "" : rest === undefined ? first.toString("utf8") : Buffer.concat(rest).toString("utf8");
                if (text.length === 0) return reject(malformedJson(true));
                try {
                    resolve(JSON.parse(text));
                } catch {
                    reject(malformedJson(false));
                }
            };
            req.on("data", onData);
            req.on("end", onEnd);
            req.on("error", reject);
        });
    }
}

function sendError(res: ServerResponse, rendered: RenderedError): void {
    if (res.headersSent) {
        res.destroy();
        return;
    }
    res.writeHead(rendered.status, { ...rendered.headers, "content-length": Buffer.byteLength(rendered.body) });
    res.end(rendered.body);
}

function writeBody(res: ServerResponse, status: number, type: string, body: string | Uint8Array, headers: Record<string, string> | null): void {
    const length = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
    res.writeHead(
        status,
        headers === null
            ? { "content-type": type, "content-length": length }
            : { "content-type": type, ...headers, "content-length": length },
    );
    res.end(body);
}

async function sendResponse(res: ServerResponse, ctx: NodeContext, response: Response): Promise<void> {
    const body = new Uint8Array(await response.arrayBuffer());
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((value, name) => {
        if (name !== "set-cookie") headers[name] = value;
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) headers["set-cookie"] = cookies;
    if (ctx.responseHeaders !== null) Object.assign(headers, ctx.responseHeaders);
    headers["content-length"] = String(body.byteLength);
    res.writeHead(response.status, headers);
    res.end(body);
}

/** Sends a handler's return value. Same rules as the Bun engine. */
function send(res: ServerResponse, ctx: NodeContext, value: unknown, runtime: AppRuntime): void {
    const status = ctx.status;
    const headers = ctx.responseHeaders;

    if (typeof value === "object" && value !== null) {
        if (value instanceof Uint8Array) return writeBody(res, status, BINARY_TYPE, value, headers);
        if (value instanceof Response) {
            sendResponse(res, ctx, value).catch((error) => sendError(res, runtime.renderError(error, ctx)));
            return;
        }
        if (value instanceof ArrayBuffer) return writeBody(res, status, BINARY_TYPE, new Uint8Array(value), headers);
    } else if (value === undefined) {
        res.writeHead(status === 200 ? 204 : status, headers ?? undefined);
        res.end();
        return;
    } else if (typeof value === "string") {
        return writeBody(res, status, TEXT_TYPE, value, headers);
    }

    writeBody(res, status, JSON_TYPE, JSON.stringify(value), headers);
}

function createHandler(route: CompiledRoute, runtime: AppRuntime): NodeHandler {
    const { run, status } = route;

    return (req, res, params, path, rawQuery) => {
        const ctx = new NodeContext(req, path, params, rawQuery, status);
        try {
            const out = run(ctx);
            if (out instanceof Promise) {
                out.then(
                    (value) => {
                        try {
                            send(res, ctx, value, runtime);
                        } catch (error) {
                            sendError(res, runtime.renderError(error, ctx));
                        }
                    },
                    (error) => sendError(res, runtime.renderError(error, ctx)),
                );
            } else {
                send(res, ctx, out, runtime);
            }
        } catch (error) {
            sendError(res, runtime.renderError(error, ctx));
        }
    };
}

export interface NodeEngineOptions {
    /** Options passed to `http.createServer` (timeouts, header limits...). */
    server?: ServerOptions;
}

/**
 * HTTP engine on `node:http`, routed by the Sparkus router. Works under Node
 * and Bun; under Bun, prefer the Bun engine.
 */
export function nodeEngine(options: NodeEngineOptions = {}): Engine {
    return {
        name: "node",
        async listen(runtime, { port, hostname }): Promise<EngineServer> {
            const router = new Router<NodeHandler>();
            for (const route of runtime.routes) router.add(route.method, route.path, createHandler(route, runtime));

            const server = createServer(options.server ?? {}, (req, res) => {
                const url = req.url!;
                const index = url.indexOf("?");
                const path = index === -1 ? url : url.slice(0, index);
                const match = router.find(req.method!, path);
                if (match !== null) {
                    match.handler(req, res, match.params, path, index === -1 ? "" : url.slice(index + 1));
                    return;
                }
                const allow = router.allowed(path);
                sendError(
                    res,
                    allow === null ? runtime.notFound(req.method!, path) : runtime.methodNotAllowed(req.method!, path, allow),
                );
            });

            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(port, hostname, () => {
                    server.off("error", reject);
                    resolve();
                });
            });

            let closed: Promise<void> | undefined;
            return {
                port: (server.address() as AddressInfo).port,
                hostname,
                stop(force) {
                    if (closed === undefined) {
                        // server.close() only closes the connections idle right now. Keep-alive
                        // connections that finish their request later must be closed too, or
                        // the drain never ends.
                        const sweep = setInterval(() => server.closeIdleConnections(), 25);
                        closed = new Promise<void>((resolve) =>
                            server.close(() => {
                                clearInterval(sweep);
                                resolve();
                            }),
                        );
                    }
                    if (force) server.closeAllConnections();
                    else server.closeIdleConnections();
                    return closed;
                },
            };
        },
    };
}
