import {
    createServer,
    validateHeaderName,
    validateHeaderValue,
    type IncomingMessage,
    type ServerOptions,
    type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
    NO_PARAMS,
    RequestExtras,
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
    type Observer,
    type RenderedError,
    type RequestContext,
} from "@sparkus/core/engine";
import type { Logger } from "@sparkus/core";

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
    private more: RequestExtras | undefined = undefined;

    constructor(
        readonly req: IncomingMessage,
        readonly res: ServerResponse,
        readonly path: string,
        public params: Readonly<Record<string, any>>,
        private readonly rawQuery: string,
        public status: number,
        readonly app: AppRuntime,
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

    get extras(): RequestExtras {
        return (this.more ??= new RequestExtras());
    }

    get requestId(): string {
        const extras = this.extras;
        return (extras.id ??= this.app.requestId(this.header(this.app.requestIdHeader)));
    }

    get log(): Logger {
        const extras = this.extras;
        return (extras.logger ??= this.app.log.with({ reqId: this.requestId }));
    }

    get signal(): AbortSignal {
        const extras = this.extras;
        if (extras.controller === undefined) {
            const controller = (extras.controller = new AbortController());
            const res = this.res;
            // "close" also follows a complete response: only an unfinished one means the client left.
            res.once("close", () => {
                if (!res.writableFinished) controller.abort(new DOMException("The client disconnected.", "AbortError"));
            });
        }
        return extras.controller.signal;
    }

    abort(reason: unknown): void {
        // Created here too: a handler that reads ctx.signal after the timeout gets it aborted.
        (this.extras.controller ??= new AbortController()).abort(reason);
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

/** Sends a problem+json response. Headers set on the context come along; the error's own win. */
function sendError(res: ServerResponse, rendered: RenderedError, headers: Record<string, string> | null = null): void {
    if (res.headersSent) {
        res.destroy();
        return;
    }
    const length = Buffer.byteLength(rendered.body);
    if (headers === null) {
        res.writeHead(rendered.status, { ...rendered.headers, "content-length": length });
    } else {
        try {
            res.writeHead(rendered.status, { ...headers, ...rendered.headers, "content-length": length });
        } catch {
            // A header the handler set is what Node refused (a newline in a value): send the error without it.
            res.writeHead(rendered.status, { ...validHeaders(headers), ...rendered.headers, "content-length": length });
        }
    }
    res.end(rendered.body);
}

/** The headers Node accepts, the others dropped. Error path only. */
function validHeaders(headers: Record<string, string>): Record<string, string> {
    const valid: Record<string, string> = {};
    for (const name in headers) {
        try {
            const value = headers[name]!;
            validateHeaderName(name);
            validateHeaderValue(name, value);
            valid[name] = value;
        } catch {
            // Dropped.
        }
    }
    return valid;
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
    const extra = ctx.responseHeaders;
    if (extra !== null) {
        // The handler's own Response wins over headers set on the context.
        for (const name in extra) if (headers[name] === undefined) headers[name] = extra[name]!;
    }
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
            sendResponse(res, ctx, value).catch((error) => sendError(res, runtime.renderError(error, ctx), ctx.responseHeaders));
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

/** Runs the pipeline and sends what it gives, or the error it throws. */
function dispatch(res: ServerResponse, ctx: NodeContext, runtime: AppRuntime, run: () => unknown): void {
    try {
        const out = run();
        if (out instanceof Promise) {
            out.then(
                (value) => {
                    try {
                        send(res, ctx, value, runtime);
                    } catch (error) {
                        sendError(res, runtime.renderError(error, ctx), ctx.responseHeaders);
                    }
                },
                (error) => sendError(res, runtime.renderError(error, ctx), ctx.responseHeaders),
            );
        } else {
            send(res, ctx, out, runtime);
        }
    } catch (error) {
        sendError(res, runtime.renderError(error, ctx), ctx.responseHeaders);
    }
}

function createHandler(route: CompiledRoute, runtime: AppRuntime): NodeHandler {
    if (runtime.observer !== null) return createObservedHandler(route, runtime, runtime.observer);
    const { run, status } = route;

    return (req, res, params, path, rawQuery) => {
        const ctx = new NodeContext(req, res, path, params, rawQuery, status, runtime);
        try {
            const out = run(ctx);
            if (out instanceof Promise) {
                out.then(
                    (value) => {
                        try {
                            send(res, ctx, value, runtime);
                        } catch (error) {
                            sendError(res, runtime.renderError(error, ctx), ctx.responseHeaders);
                        }
                    },
                    (error) => sendError(res, runtime.renderError(error, ctx), ctx.responseHeaders),
                );
            } else {
                send(res, ctx, out, runtime);
            }
        } catch (error) {
            sendError(res, runtime.renderError(error, ctx), ctx.responseHeaders);
        }
    };
}

/** Same as the plain handler, observed: start once routed, finish when the response is done (or cut). */
function createObservedHandler(route: CompiledRoute, runtime: AppRuntime, observer: Observer): NodeHandler {
    const { run, status, path: routePath } = route;
    const activate = observer.activate;

    return (req, res, params, path, rawQuery) => {
        const ctx = new NodeContext(req, res, path, params, rawQuery, status, runtime);
        observer.start(ctx, routePath, true);
        // Closed before a response (client gone, forced shutdown): 499, as nginx logs it.
        res.once("close", () => observer.finish(ctx, res.headersSent ? res.statusCode : 499, routePath));
        const span = ctx.extras.span;
        dispatch(res, ctx, runtime, activate !== undefined && span !== undefined ? () => activate(span, () => run(ctx)) : () => run(ctx));
    };
}

/** CORS preflight, 405 or 404, observed like any request when the app observes requests. */
function sendUnrouted(req: IncomingMessage, res: ServerResponse, path: string, rawQuery: string, allow: string | null, runtime: AppRuntime): void {
    const method = req.method!;
    const observer = runtime.observer;
    if (observer === null) {
        sendError(res, allow === null ? runtime.notFound(method, path) : runtime.methodNotAllowed(method, path, allow));
        return;
    }
    const ctx = new NodeContext(req, res, path, NO_PARAMS, rawQuery, 404, runtime);
    observer.start(ctx, undefined, true);
    const preflight = observer.preflight(ctx, allow);
    if (preflight !== null) {
        res.writeHead(preflight.status, preflight.headers);
        res.end();
    } else {
        sendError(res, allow === null ? runtime.notFound(method, path) : runtime.methodNotAllowed(method, path, allow), ctx.responseHeaders);
    }
    observer.finish(ctx, res.statusCode, undefined);
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
        async listen(runtime, { port, hostname, idleTimeout }): Promise<EngineServer> {
            const router = new Router<NodeHandler>();
            for (const route of runtime.routes) router.add(route.method, route.path, createHandler(route, runtime));

            const server = createServer(options.server ?? {}, (req, res) => {
                const url = req.url!;
                const index = url.indexOf("?");
                const path = index === -1 ? url : url.slice(0, index);
                const rawQuery = index === -1 ? "" : url.slice(index + 1);
                const match = router.find(req.method!, path);
                if (match !== null) {
                    match.handler(req, res, match.params, path, rawQuery);
                    return;
                }
                sendUnrouted(req, res, path, rawQuery, router.allowed(path), runtime);
            });
            if (idleTimeout !== undefined) server.keepAliveTimeout = idleTimeout;

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
