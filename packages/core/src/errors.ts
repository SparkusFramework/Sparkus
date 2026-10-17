/**
 * Every error Sparkus raises has a stable code, so humans and agents can look
 * it up. SPK1xxx: startup (the app refuses to start). SPK2xxx: request (sent
 * to the client as problem+json). SPK5xxx: internal.
 */
export const ErrorCode = {
    InjectOutsideConstruction: "SPK1001",
    DependencyCycle: "SPK1002",
    DuplicateRoute: "SPK1003",
    MissingController: "SPK1004",
    InvalidHandler: "SPK1005",
    ParamConflict: "SPK1006",
    NoEngine: "SPK1007",
    InvalidPipelineItem: "SPK1008",
    ConstructionFailed: "SPK1009",
    ProviderAfterResolution: "SPK1010",
    LateLifecycle: "SPK1011",
    NotInitialized: "SPK1012",
    NoProvider: "SPK1013",
    InvalidRoutePath: "SPK1014",
    AlreadyListening: "SPK1015",
    LifecycleFailed: "SPK1016",
    InvalidRouteSchema: "SPK1017",

    RouteNotFound: "SPK2001",
    MethodNotAllowed: "SPK2002",
    MalformedJson: "SPK2003",
    ValidationFailed: "SPK2004",
    UnsupportedMediaType: "SPK2005",
    PayloadTooLarge: "SPK2006",
    Forbidden: "SPK2007",

    Internal: "SPK5000",
    ResponseMismatch: "SPK5001",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Framework error with a stable code. The message says what is wrong and how
 * to fix it.
 */
export class SparkusError extends Error {
    override readonly name = "SparkusError";

    constructor(
        readonly code: ErrorCode,
        message: string,
        options?: { cause?: unknown },
    ) {
        super(`[${code}] ${message}`, options);
    }
}

const TITLES: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    412: "Precondition Failed",
    413: "Content Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Content",
    423: "Locked",
    428: "Precondition Required",
    429: "Too Many Requests",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
};

export function statusTitle(status: number): string {
    return TITLES[status] ?? (status >= 500 ? "Server Error" : "Client Error");
}

export interface HttpErrorOptions {
    /** Stable, machine-readable error code for clients (e.g. "USER_NOT_FOUND"). */
    code?: string;
    /** URI identifying the problem type (RFC 9457). Defaults to "about:blank". */
    type?: string;
    /** Short summary. Defaults to the standard text of the status. */
    title?: string;
    /** Extra members added to the problem+json body. */
    extensions?: Record<string, unknown>;
    /** Extra response headers. */
    headers?: Record<string, string>;
    cause?: unknown;
}

/**
 * Throw from a handler, guard or interceptor to answer with an HTTP error.
 * Sparkus sends it as `application/problem+json` (RFC 9457):
 *
 *     throw HttpError.notFound(`User ${id} not found`, { code: "USER_NOT_FOUND" });
 *
 * The detail is always sent to the client, so never put secrets in it.
 * A 4xx HttpError carries no stack trace (5xx ones do, they are logged):
 * use `code` and `detail` to tell where it comes from.
 */
export class HttpError extends Error {
    // Declared, not initialized: a class field on an Error subclass is a define per field,
    // ~220 ns per construction under Bun. The constructor assigns them all, always in this order.
    declare readonly name: "HttpError";
    declare readonly status: number;
    declare readonly detail: string | undefined;
    declare readonly code: string | undefined;
    declare readonly type: string;
    declare readonly title: string;
    declare readonly extensions: Record<string, unknown> | undefined;
    declare readonly headers: Record<string, string> | undefined;

    constructor(status: number, detail?: string, options: HttpErrorOptions = {}) {
        const title = options.title ?? statusTitle(status);
        // A 4xx is an expected answer, never logged: capturing its stack trace would cost ~5 µs
        // per error under Node (~0.1 µs under Bun), which turns a 404 or 400 flood into CPU burn.
        const stackTraceLimit = Error.stackTraceLimit;
        if (status < 500) Error.stackTraceLimit = 0;
        if (options.cause === undefined) super(detail ?? title);
        else super(detail ?? title, { cause: options.cause });
        Error.stackTraceLimit = stackTraceLimit;
        const self = this as { -readonly [K in keyof HttpError]: HttpError[K] };
        self.name = "HttpError";
        self.status = status;
        self.detail = detail;
        self.code = options.code;
        self.type = options.type ?? "about:blank";
        self.title = title;
        self.extensions = options.extensions;
        self.headers = options.headers;
    }

    static badRequest(detail?: string, options?: HttpErrorOptions): HttpError {
        return new HttpError(400, detail, options);
    }
    static unauthorized(detail?: string, options?: HttpErrorOptions): HttpError {
        return new HttpError(401, detail, options);
    }
    static forbidden(detail?: string, options?: HttpErrorOptions): HttpError {
        return new HttpError(403, detail, options);
    }
    static notFound(detail?: string, options?: HttpErrorOptions): HttpError {
        return new HttpError(404, detail, options);
    }
    static conflict(detail?: string, options?: HttpErrorOptions): HttpError {
        return new HttpError(409, detail, options);
    }
    static unprocessable(detail?: string, options?: HttpErrorOptions): HttpError {
        return new HttpError(422, detail, options);
    }
    static tooManyRequests(detail?: string, options?: HttpErrorOptions): HttpError {
        return new HttpError(429, detail, options);
    }
}

/** Body of an `application/problem+json` response (RFC 9457). */
export interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail?: string;
    code?: string;
    [extension: string]: unknown;
}

export const PROBLEM_TYPE = "application/problem+json";

/** An error turned into a response, ready for any engine to send. */
export interface RenderedError {
    status: number;
    /** JSON text of the problem details. */
    body: string;
    headers: Record<string, string>;
}

const PROBLEM_HEADERS: Record<string, string> = Object.freeze({ "content-type": PROBLEM_TYPE }) as Record<
    string,
    string
>;

export function renderHttpError(error: HttpError): RenderedError {
    const problem: ProblemDetails = { type: error.type, title: error.title, status: error.status };
    if (error.detail !== undefined) problem.detail = error.detail;
    if (error.code !== undefined) problem.code = error.code;
    if (error.extensions !== undefined) {
        for (const key in error.extensions) if (!(key in problem)) problem[key] = error.extensions[key];
    }
    return {
        status: error.status,
        body: JSON.stringify(problem),
        headers: error.headers === undefined ? PROBLEM_HEADERS : { ...error.headers, "content-type": PROBLEM_TYPE },
    };
}

/** `code` is the SparkusError's own code (SPK5001...), SPK5000 for any other error. */
export function renderInternalError(detail: string | undefined, code: ErrorCode = ErrorCode.Internal): RenderedError {
    const problem: ProblemDetails = {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        code,
    };
    if (detail !== undefined) problem.detail = detail;
    return { status: 500, body: JSON.stringify(problem), headers: PROBLEM_HEADERS };
}

// Errors raised by Sparkus while handling a request.

// 404 and 405 never reach onError (no route, no context), so they are rendered straight to
// text: a 404 flood costs one JSON.stringify of the detail, not an Error plus a problem object.
// The output is byte for byte what renderHttpError gives for the same HttpError.
const NOT_FOUND_HEAD = `{"type":"about:blank","title":"Not Found","status":404,"detail":`;
const NOT_FOUND_TAIL = `,"code":"${ErrorCode.RouteNotFound}"}`;
const NOT_ALLOWED_HEAD = `{"type":"about:blank","title":"Method Not Allowed","status":405,"detail":`;
const NOT_ALLOWED_TAIL = `,"code":"${ErrorCode.MethodNotAllowed}"}`;

/** `suggestion` (development only) is the closest route, added to the detail. */
export function renderRouteNotFound(method: string, path: string, suggestion?: string): RenderedError {
    const hint = suggestion === undefined ? "" : ` Did you mean ${suggestion}?`;
    return {
        status: 404,
        body: NOT_FOUND_HEAD + JSON.stringify(`No route matches ${method} ${path}.${hint}`) + NOT_FOUND_TAIL,
        headers: PROBLEM_HEADERS,
    };
}

export function renderMethodNotAllowed(method: string, path: string, allow: string): RenderedError {
    return {
        status: 405,
        body: NOT_ALLOWED_HEAD + JSON.stringify(`${path} does not accept ${method}. Allowed: ${allow}.`) + NOT_ALLOWED_TAIL,
        headers: { allow, "content-type": PROBLEM_TYPE },
    };
}

export function malformedJson(empty: boolean): HttpError {
    return new HttpError(400, empty ? "Request body is empty, expected JSON." : "Request body is not valid JSON.", {
        code: ErrorCode.MalformedJson,
    });
}

export function unsupportedMediaType(contentType: string | null | undefined): HttpError {
    return new HttpError(
        415,
        contentType
            ? `Expected a JSON body (content-type: application/json), got "${contentType}".`
            : "Expected a JSON body, but the request has no content-type header. Send content-type: application/json.",
        { code: ErrorCode.UnsupportedMediaType },
    );
}

export function payloadTooLarge(limit: number): HttpError {
    return new HttpError(413, `Request body exceeds the limit of ${limit} bytes.`, {
        code: ErrorCode.PayloadTooLarge,
        headers: { connection: "close" },
    });
}

export function guardRejected(): HttpError {
    return new HttpError(403, "Access denied by a guard.", { code: ErrorCode.Forbidden });
}

/** True for `application/json` and `application/*+json` media types. */
export function isJsonContentType(value: string | null | undefined): boolean {
    if (value == null) return false;
    if (value.startsWith("application/json")) {
        const next = value.charCodeAt(16);
        if (Number.isNaN(next) || next === 59 /* ; */ || next === 32 /* space */) return true;
    }
    const type = value.toLowerCase();
    const end = type.indexOf(";");
    const essence = (end === -1 ? type : type.slice(0, end)).trim();
    return essence === "application/json" || (essence.startsWith("application/") && essence.endsWith("+json"));
}
