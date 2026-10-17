import type { CompiledRoute } from "./compile.js";
import { NO_PARAMS, type RequestContext } from "./context.js";
import { isJsonContentType, malformedJson, payloadTooLarge, unsupportedMediaType, type RenderedError } from "./errors.js";
import { parseQuery } from "./query.js";
import { Router } from "./router.js";
import type { AppRuntime } from "./runtime.js";

function pathOf(url: string): string {
    const start = url.indexOf("/", url.indexOf("//") + 2);
    if (start === -1) return "/";
    const query = url.indexOf("?", start);
    return query === -1 ? url.slice(start) : url.slice(start, query);
}

/**
 * Context over a web-standard Request. Used by the Bun engine, `app.fetch`
 * and the in-memory test client.
 */
export class WebContext implements RequestContext {
    body: any = undefined;
    responseHeaders: Record<string, string> | null = null;
    private parsedQuery: Record<string, any> | undefined = undefined;
    private store: Record<string, unknown> | undefined = undefined;

    constructor(
        readonly request: Request,
        public params: Readonly<Record<string, any>>,
        public status: number,
    ) {}

    get method(): string {
        return this.request.method;
    }

    get path(): string {
        return pathOf(this.request.url);
    }

    set query(value: Record<string, any>) {
        this.parsedQuery = value;
    }

    get query(): Record<string, any> {
        if (this.parsedQuery === undefined) {
            const url = this.request.url;
            const index = url.indexOf("?");
            this.parsedQuery = parseQuery(index === -1 ? "" : url.slice(index + 1));
        }
        return this.parsedQuery;
    }

    get state(): Record<string, unknown> {
        return (this.store ??= {});
    }

    header(name: string): string | undefined {
        return this.request.headers.get(name) ?? undefined;
    }

    setHeader(name: string, value: string): void {
        (this.responseHeaders ??= {})[name.toLowerCase()] = value;
    }

    readBody(limit: number): Promise<unknown> {
        const headers = this.request.headers;
        const type = headers.get("content-type");
        if (!isJsonContentType(type)) return Promise.reject(unsupportedMediaType(type));
        const length = headers.get("content-length");
        if (length !== null && Number(length) > limit) return Promise.reject(payloadTooLarge(limit));
        return this.request.text().then((text) => {
            if (text.length > limit) throw payloadTooLarge(limit);
            if (text.length === 0) throw malformedJson(true);
            try {
                return JSON.parse(text);
            } catch {
                throw malformedJson(false);
            }
        });
    }
}

const TEXT_TYPE = "text/plain; charset=utf-8";
const BINARY_TYPE = "application/octet-stream";

export function errorResponse(rendered: RenderedError): Response {
    return new Response(rendered.body, { status: rendered.status, headers: rendered.headers });
}

function withHeaders(type: string, headers: Record<string, string> | null): Record<string, string> {
    return headers === null ? { "content-type": type } : { "content-type": type, ...headers };
}

/** Turns a handler's return value into a Response. */
export function toResponse(value: unknown, ctx: WebContext, init: ResponseInit, routeStatus: number): Response {
    const headers = ctx.responseHeaders;
    const status = ctx.status;

    if (typeof value === "object" && value !== null) {
        if (value instanceof Response) {
            if (headers !== null) for (const name in headers) value.headers.set(name, headers[name]!);
            return value;
        }
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
            // Typed loosely: Node's and Bun's BodyInit disagree on Uint8Array<ArrayBufferLike>, and
            // these sources must type check under the config of any project that imports them.
            return new Response(value as unknown as ConstructorParameters<typeof Response>[0], {
                status,
                headers: withHeaders(BINARY_TYPE, headers),
            });
        }
    } else if (value === undefined) {
        return new Response(null, { status: status === 200 ? 204 : status, headers: headers ?? undefined });
    } else if (typeof value === "string") {
        return new Response(value, { status, headers: withHeaders(TEXT_TYPE, headers) });
    }

    if (headers === null && status === routeStatus) return Response.json(value, init);
    return Response.json(value, { status, headers: headers ?? undefined });
}

export type WebHandler = (request: Request, params: Readonly<Record<string, string>>) => Response | Promise<Response>;

/** Request -> Response handler for one route. Errors never escape: they become problem+json responses. */
export function createWebHandler(route: CompiledRoute, runtime: AppRuntime): WebHandler {
    const { run, status } = route;
    const init: ResponseInit = { status };

    return (request, params) => {
        const ctx = new WebContext(request, params, status);
        const fail = (error: unknown) => errorResponse(runtime.renderError(error, ctx));
        try {
            const out = run(ctx);
            if (out instanceof Promise) {
                return out.then((value) => {
                    try {
                        return toResponse(value, ctx, init, status);
                    } catch (error) {
                        return fail(error);
                    }
                }, fail);
            }
            return toResponse(out, ctx, init, status);
        } catch (error) {
            return fail(error);
        }
    };
}

/**
 * A complete web-standard handler, routed by the Sparkus router. It is
 * `app.fetch`, the Bun engine's fallback for anything its native router
 * leaves out (404, 405, backtracking), and the in-memory test client.
 */
export function createFetchHandler(runtime: AppRuntime): (request: Request) => Promise<Response> {
    const router = new Router<WebHandler>();
    for (const route of runtime.routes) router.add(route.method, route.path, createWebHandler(route, runtime));

    return async (request) => {
        const method = request.method;
        const path = pathOf(request.url);
        const match = router.find(method, path);
        if (match === null) {
            const allow = router.allowed(path);
            return errorResponse(
                allow === null ? runtime.notFound(method, path) : runtime.methodNotAllowed(method, path, allow),
            );
        }
        const response = await match.handler(request, match.params);
        return method === "HEAD" ? new Response(null, response) : response;
    };
}

export { NO_PARAMS };
