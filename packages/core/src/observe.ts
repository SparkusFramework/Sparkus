/**
 * What an app adds around every request when asked to: CORS, security headers, the request id
 * header, one log line per request, and OpenTelemetry spans and metrics. Built once at startup;
 * when none of it is on, the runtime has no observer and engines keep their plain request path.
 */
import type { Ctx, RequestContext } from "./context.js";
import { ErrorCode, SparkusError } from "./errors.js";
import type { Logger } from "./log.js";

/** Attribute values, as OpenTelemetry defines them. */
export type AttributeValue = string | number | boolean | ReadonlyArray<string> | ReadonlyArray<number> | ReadonlyArray<boolean>;
export type Attributes = Record<string, AttributeValue | undefined>;

/**
 * The part of an OpenTelemetry span Sparkus uses. A span from `@opentelemetry/api` fits as is:
 * Sparkus has no dependency on it (D9), the types are structural.
 */
export interface Span {
    setAttribute(key: string, value: AttributeValue): unknown;
    setStatus(status: { code: number; message?: string }): unknown;
    recordException(exception: unknown): void;
    end(): void;
}

/** The part of an OpenTelemetry tracer Sparkus uses: `trace.getTracer("api")` fits. */
export interface Tracer {
    startSpan(name: string, options?: { kind?: number; attributes?: Attributes }, context?: any): Span;
}

export interface Histogram {
    record(value: number, attributes?: Attributes): void;
}

/** The part of an OpenTelemetry meter Sparkus uses: `metrics.getMeter("api")` fits. */
export interface Meter {
    createHistogram(
        name: string,
        options?: { description?: string; unit?: string; advice?: { explicitBucketBoundaries?: number[] } },
    ): Histogram;
}

/**
 * OpenTelemetry hooks, without the SDK: pass a tracer and a meter from `@opentelemetry/api`.
 * Each request gets a server span named after its route (`GET /users/:id`) and a
 * `http.server.request.duration` measure, with the HTTP semantic convention attributes.
 */
export interface TelemetryOptions {
    tracer?: Tracer;
    meter?: Meter;
    /**
     * Parent context of the server span, usually from the `traceparent` header:
     * `(ctx) => propagation.extract(context.active(), ctx, { get: (c, key) => c.header(key), keys: () => [] })`.
     */
    extract?: (ctx: Ctx<any>) => unknown;
    /**
     * Runs the request inside the span's context, so spans your code starts are its children:
     * `(span, run) => context.with(trace.setSpan(context.active(), span as OtelSpan), run)`.
     */
    activate?: <T>(span: Span, run: () => T) => T;
}

export interface CorsOptions {
    /**
     * Origins allowed to call the API from a browser: "*" (any, without credentials), an
     * origin ("https://app.example.com", no trailing slash), a list of origins or RegExps, or a function.
     */
    origin: "*" | string | RegExp | ReadonlyArray<string | RegExp> | ((origin: string) => boolean);
    /** Allow cookies and Authorization headers (`access-control-allow-credentials`). Not with origin "*". */
    credentials?: boolean;
    /** Methods allowed by preflight responses. Default: the methods the requested path accepts. */
    methods?: readonly string[];
    /** Request headers allowed by preflight responses. Default: the ones the browser asks for. */
    allowedHeaders?: readonly string[];
    /** Response headers the browser may read. The request id header is added when `requestId` is on. */
    exposedHeaders?: readonly string[];
    /** Seconds a browser may cache a preflight response. Default: 600. */
    maxAge?: number;
}

/**
 * Default security headers for a JSON API (OWASP REST Security). Override one with its
 * lowercase name, or drop it with `false`: `{ "strict-transport-security": false }`.
 * A header set by the handler wins.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=15552000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
});

export interface ObserverOptions {
    log: Logger;
    requests: boolean;
    cors: CorsOptions | undefined;
    securityHeaders: Readonly<Record<string, string | false>> | undefined;
    /** Header the request id is echoed in, or null. */
    echoRequestId: string | null;
    telemetry: TelemetryOptions | undefined;
}

/** A response with no body: CORS preflights. */
export interface BareResponse {
    status: number;
    headers: Record<string, string>;
}

const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]+$/i;
const KNOWN_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"]);
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10];
const SPAN_KIND_SERVER = 1;
const SPAN_STATUS_ERROR = 2;

function invalidOption(message: string): SparkusError {
    return new SparkusError(ErrorCode.InvalidOption, message);
}

function checkOrigin(origin: string): void {
    if (!ORIGIN.test(origin)) {
        const fix = origin.endsWith("/") ? ` Remove the trailing slash: "${origin.replace(/\/+$/, "")}".` : ' Use scheme://host[:port], like "https://app.example.com".';
        throw invalidOption(`cors.origin "${origin}" never matches: browsers send an origin without a path.${fix}`);
    }
}

/** Compiles the origin option into a test. */
function originTest(origin: CorsOptions["origin"]): (origin: string) => boolean {
    if (typeof origin === "function") return origin;
    if (origin instanceof RegExp) return (value) => origin.test(value);
    const list = typeof origin === "string" ? [origin] : origin;
    const exact = new Set<string>();
    const patterns: RegExp[] = [];
    for (const item of list) {
        if (item instanceof RegExp) patterns.push(item);
        else {
            checkOrigin(item);
            exact.add(item.toLowerCase());
        }
    }
    return (value) => exact.has(value.toLowerCase()) || patterns.some((pattern) => pattern.test(value));
}

export class Observer {
    /** Headers every response starts with (security headers, static CORS headers), or null. */
    private readonly base: Readonly<Record<string, string>> | null;
    private readonly allowOrigin: ((origin: string) => boolean) | null;
    private readonly cors: CorsOptions | undefined;
    /** `access-control-expose-headers` for an allowed origin, when origins are listed. */
    private readonly exposed: string | null;
    private readonly echo: string | null;
    private readonly http: Logger | null;
    private readonly tracer: Tracer | undefined;
    private readonly extract: TelemetryOptions["extract"];
    readonly activate: TelemetryOptions["activate"];
    private readonly duration: Histogram | undefined;
    /** True when the start time is needed (logs or metrics). */
    private readonly timed: boolean;

    constructor(options: ObserverOptions) {
        const base: Record<string, string> = {};
        if (options.securityHeaders !== undefined) {
            for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...lowerKeys(options.securityHeaders) })) {
                if (value !== false) base[name] = value;
            }
        }

        const cors = options.cors;
        this.cors = cors;
        this.allowOrigin = null;
        if (cors !== undefined) {
            if (cors.origin === "*") {
                if (cors.credentials === true) {
                    throw invalidOption(
                        'cors: origin "*" cannot be used with credentials: true (browsers reject it). List the allowed origins instead.',
                    );
                }
                base["access-control-allow-origin"] = "*";
            } else {
                this.allowOrigin = originTest(cors.origin);
                // The answer depends on the Origin header: caches must not share it between origins.
                base.vary = "origin";
            }
            if (cors.maxAge !== undefined && (!Number.isInteger(cors.maxAge) || cors.maxAge < 0)) {
                throw invalidOption(`cors.maxAge ${cors.maxAge} is not a number of seconds. Use an integer >= 0.`);
            }
        }
        const exposed = [...(cors?.exposedHeaders ?? []), ...(options.echoRequestId === null ? [] : [options.echoRequestId])];
        this.exposed = cors === undefined || exposed.length === 0 ? null : exposed.join(", ");
        if (cors?.origin === "*" && this.exposed !== null) base["access-control-expose-headers"] = this.exposed;
        this.base = Object.keys(base).length === 0 ? null : Object.freeze(base);
        this.echo = options.echoRequestId;
        this.http = options.requests ? options.log.child("http") : null;

        const telemetry = options.telemetry ?? {};
        this.tracer = telemetry.tracer;
        this.extract = telemetry.extract;
        this.activate = telemetry.tracer === undefined ? undefined : telemetry.activate;
        this.duration = telemetry.meter?.createHistogram("http.server.request.duration", {
            description: "Duration of HTTP server requests.",
            unit: "s",
            advice: { explicitBucketBoundaries: DURATION_BUCKETS },
        });
        this.timed = this.http !== null || this.duration !== undefined;
    }

    /** True when the options ask for anything at all. */
    static needed(options: ObserverOptions): boolean {
        const telemetry = options.telemetry;
        return (
            options.requests ||
            options.cors !== undefined ||
            options.securityHeaders !== undefined ||
            options.echoRequestId !== null ||
            telemetry?.tracer !== undefined ||
            telemetry?.meter !== undefined
        );
    }

    /** Called once the route is known (undefined: no route). Sets the response headers to start with. */
    start(ctx: RequestContext, route: string | undefined): void {
        const extras = ctx.extras;
        if (this.timed) extras.startTime = performance.now();
        let headers: Record<string, string> | null = this.base === null ? null : { ...this.base };
        if (this.allowOrigin !== null) {
            const origin = ctx.header("origin");
            if (origin !== undefined && this.allowOrigin(origin)) {
                headers ??= {};
                headers["access-control-allow-origin"] = origin;
                if (this.cors!.credentials === true) headers["access-control-allow-credentials"] = "true";
                if (this.exposed !== null) headers["access-control-expose-headers"] = this.exposed;
            }
        }
        if (this.echo !== null) (headers ??= {})[this.echo] = ctx.requestId;
        ctx.responseHeaders = headers;

        if (this.tracer !== undefined) {
            const method = KNOWN_METHODS.has(ctx.method) ? ctx.method : "_OTHER";
            const attributes: Attributes = { "http.request.method": method, "url.path": ctx.path, "url.scheme": "http" };
            if (route !== undefined) attributes["http.route"] = route;
            const agent = ctx.header("user-agent");
            if (agent !== undefined) attributes["user_agent.original"] = agent;
            const name = route === undefined ? method : `${method} ${route}`;
            extras.span = this.tracer.startSpan(name, { kind: SPAN_KIND_SERVER, attributes }, this.extract?.(ctx));
        }
    }

    /**
     * The answer to a CORS preflight (OPTIONS with access-control-request-method) on a path that
     * has routes, or null when the request is something else. `allow` lists the path's methods.
     */
    preflight(ctx: RequestContext, allow: string | null): BareResponse | null {
        if (this.cors === undefined || allow === null || ctx.method !== "OPTIONS") return null;
        if (ctx.header("access-control-request-method") === undefined) return null;
        const headers = ctx.responseHeaders ?? {};
        if (headers["access-control-allow-origin"] !== undefined) {
            headers["access-control-allow-methods"] = this.cors.methods?.join(", ") ?? allow;
            const asked = this.cors.allowedHeaders?.join(", ") ?? ctx.header("access-control-request-headers");
            if (asked !== undefined && asked.length > 0) headers["access-control-allow-headers"] = asked;
            headers["access-control-max-age"] = String(this.cors.maxAge ?? 600);
        }
        return { status: 204, headers };
    }

    /** Called with the final status: request log line, duration metric, end of the span. */
    finish(ctx: RequestContext, status: number, route: string | undefined): void {
        const extras = ctx.extras;
        if (this.timed) {
            const ms = performance.now() - extras.startTime;
            if (this.http !== null) {
                this.http.info(`${ctx.method} ${ctx.path} ${status}`, {
                    reqId: ctx.requestId,
                    method: ctx.method,
                    path: ctx.path,
                    route,
                    status,
                    ms: Math.round(ms * 100) / 100,
                });
            }
            if (this.duration !== undefined) {
                const attributes: Attributes = {
                    "http.request.method": KNOWN_METHODS.has(ctx.method) ? ctx.method : "_OTHER",
                    "http.response.status_code": status,
                    "url.scheme": "http",
                };
                if (route !== undefined) attributes["http.route"] = route;
                if (status >= 500) attributes["error.type"] = String(status);
                this.duration.record(ms / 1000, attributes);
            }
        }
        const span = extras.span;
        if (span !== undefined) {
            span.setAttribute("http.response.status_code", status);
            if (status >= 500) {
                span.setAttribute("error.type", String(status));
                span.setStatus({ code: SPAN_STATUS_ERROR });
            }
            span.end();
        }
    }
}

function lowerKeys<T>(record: Readonly<Record<string, T>>): Record<string, T> {
    const out: Record<string, T> = {};
    for (const [key, value] of Object.entries(record)) out[key.toLowerCase()] = value;
    return out;
}
