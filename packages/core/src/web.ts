import type { CompiledRoute } from "./compile.js";
import { NO_PARAMS, RequestExtras, type RequestContext } from "./context.js";
import { isJsonContentType, malformedJson, payloadTooLarge, unsupportedMediaType, type RenderedError } from "./errors.js";
import type { Logger } from "./log.js";
import type { BareResponse, Observer } from "./observe.js";
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
    private more: RequestExtras | undefined = undefined;

    constructor(
        readonly request: Request,
        public params: Readonly<Record<string, any>>,
        public status: number,
        readonly app: AppRuntime,
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

    get extras(): RequestExtras {
        return (this.more ??= new RequestExtras());
    }

    get requestId(): string {
        const extras = this.extras;
        return (extras.id ??= this.app.requestId(this.request.headers.get(this.app.requestIdHeader)));
    }

    get log(): Logger {
        const extras = this.extras;
        return (extras.logger ??= this.app.log.with({ reqId: this.requestId }));
    }

    get signal(): AbortSignal {
        const extras = this.extras;
        if (extras.controller === undefined) {
            const controller = (extras.controller = new AbortController());
            // Bun aborts the request's signal when the client disconnects.
            const client = this.request.signal;
            if (client.aborted) controller.abort(client.reason);
            else client.addEventListener("abort", () => controller.abort(client.reason), { once: true });
        }
        return extras.controller.signal;
    }

    abort(reason: unknown): void {
        // Created here too: a handler that reads ctx.signal after the timeout gets it aborted.
        (this.extras.controller ??= new AbortController()).abort(reason);
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

/** A problem+json response. Headers set on the context come along; the error's own win. */
export function errorResponse(rendered: RenderedError, headers: Record<string, string> | null = null): Response {
    if (headers !== null) {
        try {
            return new Response(rendered.body, { status: rendered.status, headers: { ...headers, ...rendered.headers } });
        } catch {
            // A header the handler set is what failed (a newline in a value): send the error without it.
        }
    }
    return new Response(rendered.body, { status: rendered.status, headers: rendered.headers });
}

function withHeaders(type: string, headers: Record<string, string> | null): Record<string, string> {
    return headers === null ? { "content-type": type } : { "content-type": type, ...headers };
}

/** Turns a handler's return value into a Response. */
export function toResponse(
    value: unknown,
    ctx: WebContext,
    init: ResponseInit | undefined,
    routeStatus: number,
): Response {
    const headers = ctx.responseHeaders;
    const status = ctx.status;

    if (typeof value === "object" && value !== null) {
        if (value instanceof Response) return headers === null ? value : withOwnHeaders(value, null, headers);
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

/** Copies headers into `target`; with `keep`, a header already there stays (a handler's Response wins). */
function setAll(target: Headers, headers: Readonly<Record<string, string>> | null, keep: boolean): void {
    if (headers === null) return;
    for (const name in headers) if (!keep || !target.has(name)) target.set(name, headers[name]!);
}

/**
 * A handler's own Response with the app's and the context's headers added where it has none.
 * A copy: the original may be immutable (`Response.redirect()`, a `fetch()` result under Node)
 * or shared between requests (a module-level constant).
 */
function withOwnHeaders(value: Response, base: Headers | null, own: Readonly<Record<string, string>> | null): Response {
    const headers = new Headers(value.headers);
    if (base !== null) {
        base.forEach((header, name) => {
            if (!headers.has(name)) headers.set(name, header);
        });
    }
    setAll(headers, own, true);
    return new Response(value.body, { status: value.status, statusText: value.statusText, headers });
}

/**
 * `toResponse` for an observed request: the app's headers for every response (security, CORS),
 * then the context's. Bun builds a Response's headers from a plain object at ~75 ns per entry, but
 * copies a Headers object in ~50 ns in all: the common ones are built once, then copied.
 */
export function toObservedResponse(value: unknown, ctx: WebContext, base: Headers): Response {
    const own = ctx.responseHeaders;
    const status = ctx.status;

    if (typeof value === "object" && value !== null) {
        if (value instanceof Response) return withOwnHeaders(value, base, own);
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
            const headers = new Headers(base);
            headers.set("content-type", BINARY_TYPE);
            setAll(headers, own, false);
            return new Response(value as unknown as ConstructorParameters<typeof Response>[0], { status, headers });
        }
    } else if (value === undefined) {
        const headers = new Headers(base);
        setAll(headers, own, false);
        return new Response(null, { status: status === 200 ? 204 : status, headers });
    } else if (typeof value === "string") {
        const headers = new Headers(base);
        headers.set("content-type", TEXT_TYPE);
        setAll(headers, own, false);
        return new Response(value, { status, headers });
    }

    const headers = new Headers(base);
    setAll(headers, own, false);
    return Response.json(value, { status, headers });
}

/** `errorResponse` for an observed request: the app's headers, the context's, then the error's own. */
function observedErrorResponse(rendered: RenderedError, ctx: WebContext, base: Headers | null): Response {
    if (base === null) return errorResponse(rendered, ctx.responseHeaders);
    const headers = new Headers(base);
    try {
        setAll(headers, ctx.responseHeaders, false);
    } catch {
        // A header the handler set is invalid: the error goes without it.
    }
    setAll(headers, rendered.headers, false);
    return new Response(rendered.body, { status: rendered.status, headers });
}

function failed(error: unknown, ctx: WebContext, runtime: AppRuntime): Response {
    return errorResponse(runtime.renderError(error, ctx), ctx.responseHeaders);
}

/** Request -> Response handler for one route. Errors never escape: they become problem+json responses. */
export function createWebHandler(route: CompiledRoute, runtime: AppRuntime): WebHandler {
    if (runtime.observer !== null) return createObservedHandler(route, runtime, runtime.observer);
    const { run, status } = route;
    // Bun charges ~80 ns for reading any init object, even { status: 200 }: pass none when the default fits.
    const init: ResponseInit | undefined = status === 200 ? undefined : { status };

    return (request, params) => {
        const ctx = new WebContext(request, params, status, runtime);
        try {
            const out = run(ctx);
            if (out instanceof Promise) {
                return out.then(
                    (value) => {
                        try {
                            return toResponse(value, ctx, init, status);
                        } catch (error) {
                            return failed(error, ctx, runtime);
                        }
                    },
                    (error) => failed(error, ctx, runtime),
                );
            }
            return toResponse(out, ctx, init, status);
        } catch (error) {
            return failed(error, ctx, runtime);
        }
    };
}

/** Same as the plain handler, with the observer around it: start once routed, finish with the final status. */
function createObservedHandler(route: CompiledRoute, runtime: AppRuntime, observer: Observer): WebHandler {
    const { run, status, path } = route;
    const init: ResponseInit | undefined = status === 200 ? undefined : { status };
    const activate = observer.activate;
    const base = observer.baseHeaders;
    /** The response for a value, or for the error building it threw; finished once, whatever happens. */
    const respond = (value: unknown, ctx: WebContext): Response => {
        let response: Response;
        try {
            response = base === null ? toResponse(value, ctx, init, status) : toObservedResponse(value, ctx, base);
        } catch (error) {
            response = observedErrorResponse(runtime.renderError(error, ctx), ctx, base);
        }
        observer.finish(ctx, response.status, path);
        return response;
    };
    const fail = (error: unknown, ctx: WebContext): Response => {
        const response = observedErrorResponse(runtime.renderError(error, ctx), ctx, base);
        observer.finish(ctx, response.status, path);
        return response;
    };

    return (request, params) => {
        const ctx = new WebContext(request, params, status, runtime);
        observer.start(ctx, path, false);
        let out: unknown;
        try {
            const span = ctx.extras.span;
            out = activate !== undefined && span !== undefined ? activate(span, () => run(ctx)) : run(ctx);
        } catch (error) {
            return fail(error, ctx);
        }
        if (out instanceof Promise) {
            return out.then(
                (value) => respond(value, ctx),
                (error) => fail(error, ctx),
            );
        }
        return respond(out, ctx);
    };
}

function bareResponse(bare: BareResponse): Response {
    return new Response(null, bare);
}

/**
 * Answer to a request no route takes: CORS preflight, 405 or 404. Observed like any request.
 * `allow` lists the methods of the path, null when no route has it.
 */
export function unroutedResponse(request: Request, method: string, path: string, allow: string | null, runtime: AppRuntime): Response {
    const observer = runtime.observer;
    if (observer === null) {
        return errorResponse(allow === null ? runtime.notFound(method, path) : runtime.methodNotAllowed(method, path, allow));
    }
    const ctx = new WebContext(request, NO_PARAMS, 404, runtime);
    observer.start(ctx, undefined, false);
    const preflight = observer.preflight(ctx, allow);
    const response =
        preflight !== null
            ? bareResponse(preflight)
            : observedErrorResponse(
                  allow === null ? runtime.notFound(method, path) : runtime.methodNotAllowed(method, path, allow),
                  ctx,
                  observer.baseHeaders,
              );
    observer.finish(ctx, response.status, undefined);
    return response;
}

/**
 * A complete web-standard handler, routed by the Sparkus router. It is
 * `app.fetch`, the Bun engine's fallback for anything its native router
 * leaves out (404, 405, preflight, backtracking), and the in-memory test client.
 */
export function createFetchHandler(runtime: AppRuntime): (request: Request) => Promise<Response> {
    const router = new Router<WebHandler>();
    for (const route of runtime.routes) router.add(route.method, route.path, createWebHandler(route, runtime));

    return async (request) => {
        const method = request.method;
        const path = pathOf(request.url);
        const match = router.find(method, path);
        if (match === null) return unroutedResponse(request, method, path, router.allowed(path), runtime);
        const response = await match.handler(request, match.params);
        return method === "HEAD" ? new Response(null, response) : response;
    };
}

export { NO_PARAMS };
