import type { Infer, Schema } from "./schema.js";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

export interface RouteOptions {
    /** Schema of the JSON body. The body is read and validated before the handler runs. */
    body?: Schema;
    /**
     * Types of the path parameters: `t.object({ id: t.integer() })`. Values are converted
     * and validated before guards run. Must name exactly the path's parameters.
     */
    params?: Schema;
    /** Types of the query parameters, converted and validated like `params`. Unknown keys are dropped. */
    query?: Schema;
    /** Status of a successful response. Defaults to 200 (204 when the handler returns nothing). */
    status?: number;
}

/**
 * Request context received by handlers, guards and interceptors. `body` is
 * typed from the route's schema: `ctx: Ctx<typeof CreateUser>`.
 */
export interface Ctx<O extends RouteOptions = RouteOptions> {
    /** HTTP method, uppercase. */
    readonly method: string;
    /** Path without the query string, as received (not decoded). */
    readonly path: string;
    /** Path parameters, decoded: `/users/:id` gives `ctx.params.id`. Typed and converted when the route declares `params`. */
    readonly params: O["params"] extends Schema ? Readonly<Infer<O["params"]>> : Readonly<Record<string, string>>;
    /** Query parameters, decoded; the first occurrence of a key wins. Typed and converted when the route declares `query`. */
    readonly query: O["query"] extends Schema ? Readonly<Infer<O["query"]>> : Readonly<Record<string, string | undefined>>;
    /** Parsed and validated JSON body, typed from the route's schema. `undefined` when the route has no body schema. */
    readonly body: O["body"] extends Schema ? Infer<O["body"]> : undefined;
    /** Reads a request header (case-insensitive). */
    header(name: string): string | undefined;
    /** Status of the response. Starts at the route's status; set it to change the response status. */
    status: number;
    /** Sets a response header. */
    setHeader(name: string, value: string): void;
    /** Per-request storage shared by guards, interceptors and the handler (e.g. the authenticated user). */
    readonly state: Record<string, unknown>;
}

/** What an engine's context provides on top of `Ctx`. Engines implement it; applications never see it. */
export interface RequestContext extends Ctx<any> {
    body: any;
    /** Replaced by the typed values when the route declares a params schema. */
    params: any;
    /** Replaced by the typed values when the route declares a query schema. */
    query: any;
    /** Response headers set with `setHeader()`, or null when none. */
    readonly responseHeaders: Record<string, string> | null;
    /**
     * Reads and parses the JSON body. Rejects with an HttpError: 415 when the
     * content type is not JSON, 413 above `limit` bytes, 400 when malformed.
     */
    readBody(limit: number): Promise<unknown>;
}

export const NO_PARAMS: Readonly<Record<string, string>> = Object.freeze(Object.create(null));
