import type { RequestContext } from "./context.js";
import { ErrorCode, SparkusError } from "./errors.js";

/** Log levels, from the most verbose. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** A level, or "silent" to log nothing. */
export type LogThreshold = LogLevel | "silent";

/**
 * Extra fields of a log line: an object of fields, or anything else (an Error, a `catch`
 * variable) logged as `err`.
 */
export type LogFields = Readonly<Record<string, unknown>> | Error | unknown;

function isFieldObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Error);
}

/** Runs `flush` soon: on the next event loop turn where there is one (Node, Bun), else after a timer. */
const later: (flush: () => void) => void =
    typeof setImmediate === "function" ? (flush) => void setImmediate(flush) : (flush) => void setTimeout(flush, 0);

export interface LoggerOptions {
    /**
     * Minimum level. Default: the LOG_LEVEL environment variable ("debug", or with module
     * levels: "info,db=debug,sparkus=warn"), else "warn" when NODE_ENV is "test", else "info".
     */
    level?: LogThreshold;
    /**
     * Levels per module, the name given to `child()`: `{ db: "debug" }` also covers "db.pool".
     * Request log lines use the module "http", Sparkus' own lines "sparkus". Merged over the
     * module levels of LOG_LEVEL, when LOG_LEVEL applies (no `level` given).
     */
    modules?: Readonly<Record<string, LogThreshold>>;
    /**
     * "json": one object per line, for production and agents. "pretty": aligned and colored,
     * for humans. Default: "pretty" when stdout is a terminal and NODE_ENV is not "production".
     */
    format?: "json" | "pretty";
    /** One line per request: method, path, status, duration, request id. Default: false. */
    requests?: boolean;
    /**
     * Adds the request id (`reqId`) and the server span's `trace_id` and `span_id` (telemetry) to
     * every line logged while a request is handled, by any logger: a service that logs with
     * `inject(Logger)` needs no `ctx`. Uses AsyncLocalStorage around each request: about 4 % of
     * throughput under Node 24, under 1 % under Bun. Default: false.
     */
    requestContext?: boolean;
    /**
     * Receives each line (without "\n"). Default: stdout (stderr when SPARKUS_LOG_STDERR=1, as the
     * CLI sets it), buffered and flushed once per event loop turn.
     */
    write?: (line: string) => void;
}

const RANK: Readonly<Record<LogThreshold, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
    silent: Number.POSITIVE_INFINITY,
};

const LEVEL_LIST = "trace, debug, info, warn, error, fatal or silent";

function isThreshold(value: string): value is LogThreshold {
    return Object.hasOwn(RANK, value);
}

function env(name: string): string | undefined {
    return globalThis.process?.env?.[name];
}

/**
 * Parses LOG_LEVEL: a level, optionally followed by module levels ("info,db=debug").
 * Throws SPK1018 on anything else: a typo must not silently log nothing.
 */
export function parseLogLevel(text: string): { level: LogThreshold | undefined; modules: Record<string, LogThreshold> } {
    let level: LogThreshold | undefined;
    const modules: Record<string, LogThreshold> = {};
    for (const part of text.split(",")) {
        const item = part.trim();
        if (item.length === 0) continue;
        const eq = item.indexOf("=");
        // Levels are case-insensitive, module names are not: they match child("Name") as written.
        const value = (eq === -1 ? item : item.slice(eq + 1).trim()).toLowerCase();
        const module = eq === -1 ? "" : item.slice(0, eq).trim();
        if (!isThreshold(value) || (eq !== -1 && module.length === 0)) {
            const problem = isThreshold(value) ? `"${item}" names no module` : `"${value}" is not a level`;
            throw new SparkusError(
                ErrorCode.InvalidConfig,
                `LOG_LEVEL "${text}": ${problem}. Use ${LEVEL_LIST}, optionally with module levels: "info,db=debug".`,
            );
        }
        if (eq === -1) level = value;
        else modules[module] = value;
    }
    return { level, modules };
}

/** Serializes an Error with its own fields (code, status...) and its cause. Never throws. */
function errorObject(error: Error, depth: number): Record<string, unknown> {
    const out: Record<string, unknown> = { type: error.name, message: error.message };
    for (const key of Object.keys(error)) {
        // `type` is the class name: an own `type` (HttpError's problem type) does not replace it.
        if (key === "name" || key === "message" || key === "stack" || key === "cause" || key === "type") continue;
        const value = (error as unknown as Record<string, unknown>)[key];
        if (value !== undefined && typeof value !== "function") out[key] = value;
    }
    if (error.stack !== undefined) out.stack = error.stack;
    const cause = (error as { cause?: unknown }).cause;
    if (cause !== undefined) out.cause = cause instanceof Error && depth < 3 ? errorObject(cause, depth + 1) : String(cause);
    return out;
}

function json(value: unknown): string | undefined {
    try {
        return JSON.stringify(value instanceof Error ? errorObject(value, 0) : value);
    } catch {
        return '"[unserializable]"';
    }
}

/** `,"key":value` for each defined field. */
function fieldsJson(fields: LogFields | undefined): string {
    if (fields === undefined) return "";
    if (!isFieldObject(fields)) return `,"err":${json(fields)}`;
    let out = "";
    for (const key in fields) {
        const text = json(fields[key]);
        if (text !== undefined) out += `,${JSON.stringify(key)}:${text}`;
    }
    return out;
}

/** Writes to stdout in batches: one write per event loop turn instead of one per line. */
class StdoutSink {
    private buffer = "";
    private scheduled = false;
    private hooked = false;

    readonly write = (line: string): void => {
        this.buffer += line + "\n";
        if (this.buffer.length > 65_536) this.flush();
        else if (!this.scheduled) {
            this.scheduled = true;
            if (!this.hooked) {
                this.hooked = true;
                globalThis.process?.on?.("exit", this.flush);
            }
            later(this.flush);
        }
    };

    readonly flush = (): void => {
        this.scheduled = false;
        if (this.buffer.length === 0) return;
        const text = this.buffer;
        this.buffer = "";
        // The CLI sets SPARKUS_LOG_STDERR: its own output on stdout (JSON, OpenAPI) stays parseable.
        const stream = env("SPARKUS_LOG_STDERR") === "1" ? globalThis.process?.stderr : globalThis.process?.stdout;
        if (stream === undefined) console.log(text.slice(0, -1));
        else stream.write(text);
    };
}

const stdoutSink = new StdoutSink();

/** The request being handled, across awaits: an AsyncLocalStorage, the same for every app of the process. */
export interface RequestScope {
    getStore(): RequestContext | undefined;
    run<R>(store: RequestContext, fn: (ctx: RequestContext) => R, ctx: RequestContext): R;
}

let scope: RequestScope | null = null;

/**
 * Creates the request scope on first use. Loaded only by apps that ask for it: `node:async_hooks`
 * exists under Bun and Node, but `app.fetch` may run elsewhere.
 */
export async function requestScope(): Promise<RequestScope> {
    if (scope === null) {
        const { AsyncLocalStorage } = await import("node:async_hooks");
        scope ??= new AsyncLocalStorage<RequestContext>();
    }
    return scope;
}

/** Trace id of a span that records nothing (OpenTelemetry's INVALID_TRACEID). */
const NO_TRACE = "00000000000000000000000000000000";

/** The server span's ids, when telemetry is on and the span has valid ones. */
function traceIds(ctx: RequestContext): { traceId: string; spanId: string } | undefined {
    const span = ctx.extras.span;
    if (span?.spanContext === undefined) return undefined;
    try {
        const ids = span.spanContext();
        return typeof ids.traceId === "string" && typeof ids.spanId === "string" && ids.traceId !== NO_TRACE ? ids : undefined;
    } catch {
        return undefined;
    }
}

const COLORS: Record<LogLevel, string> = {
    trace: "\x1b[90m",
    debug: "\x1b[36m",
    info: "\x1b[32m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    fatal: "\x1b[35m",
};

const PLAIN = /^[\w.:/@+-]*$/;

function prettyValue(value: unknown): string {
    if (typeof value === "string") return PLAIN.test(value) && value.length > 0 ? value : JSON.stringify(value);
    if (value instanceof Error) return JSON.stringify(`${value.name}: ${value.message}`);
    return json(value) ?? String(value);
}

function time(now: Date): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

/** What every logger of one tree shares. */
class LogRoot {
    readonly levels: Array<[string, number]>;
    readonly rank: number;
    readonly pretty: boolean;
    readonly color: boolean;
    readonly write: (line: string) => void;
    readonly requests: boolean;
    readonly requestContext: boolean;

    constructor(options: LoggerOptions) {
        const fromEnv = options.level === undefined ? env("LOG_LEVEL") : undefined;
        const parsed = fromEnv === undefined ? { level: undefined, modules: {} } : parseLogLevel(fromEnv);
        const level = options.level ?? parsed.level ?? (env("NODE_ENV") === "test" ? "warn" : "info");
        if (!isThreshold(level)) {
            throw new SparkusError(ErrorCode.InvalidOption, `logger.level "${String(level)}" is not a level. Use ${LEVEL_LIST}.`);
        }
        this.rank = RANK[level];
        const modules = { ...parsed.modules, ...options.modules };
        for (const [name, value] of Object.entries(modules)) {
            if (!isThreshold(value)) {
                throw new SparkusError(ErrorCode.InvalidOption, `logger.modules.${name} "${String(value)}" is not a level. Use ${LEVEL_LIST}.`);
            }
        }
        // Longest names first: the most specific module wins.
        this.levels = Object.entries(modules)
            .map(([name, value]): [string, number] => [name, RANK[value]])
            .sort((a, b) => b[0].length - a[0].length);
        const tty = globalThis.process?.stdout?.isTTY === true;
        this.pretty = (options.format ?? (tty && env("NODE_ENV") !== "production" ? "pretty" : "json")) === "pretty";
        this.color = this.pretty && options.write === undefined && tty && env("NO_COLOR") === undefined;
        this.write = options.write ?? stdoutSink.write;
        this.requests = options.requests === true;
        this.requestContext = options.requestContext === true;
    }

    rankOf(module: string | undefined): number {
        if (module !== undefined) {
            for (const [name, rank] of this.levels) {
                if (module === name || (module.startsWith(name) && module.charCodeAt(name.length) === 46 /* . */)) return rank;
            }
        }
        return this.rank;
    }
}

/**
 * Structured logger. JSON lines in production (`{"level":"info","time":...,"module":"users","msg":"..."}`),
 * readable lines in a terminal. Inject it, and name your module:
 *
 *     private readonly log = inject(Logger).child("users");
 *     this.log.info("User created", { userId: user.id });
 *     this.log.error("Payment failed", error);
 *
 * In a handler, `ctx.log` adds the request id to every line; with `requestContext: true`, every
 * logger does while a request is handled. Levels are fixed per module when
 * the child is created, so a disabled call costs one comparison.
 */
export class Logger {
    private readonly root: LogRoot;
    /** Module name ("users", "users.repo"), undefined for the root logger. */
    readonly module: string | undefined;
    private readonly min: number;
    /** JSON of the module and bound fields: `,"module":"users","reqId":"..."`. */
    private readonly bound: string;
    private readonly fields: Readonly<Record<string, unknown>> | undefined;
    /** True when the request context adds fields to its lines (`requestContext`). */
    private readonly scoped: boolean;
    /** True when its bound fields already name the request (`ctx.log`). */
    private readonly ownId: boolean;

    /** `new Logger({ write })` captures lines in tests. The second parameter is internal (children). */
    constructor(options: LoggerOptions = {}, parent?: { root: LogRoot; module: string | undefined; fields?: Readonly<Record<string, unknown>> }) {
        this.root = parent?.root ?? new LogRoot(options);
        this.module = parent?.module;
        this.fields = parent?.fields;
        this.min = this.root.rankOf(this.module);
        this.bound = (this.module === undefined ? "" : `,"module":${JSON.stringify(this.module)}`) + fieldsJson(this.fields);
        this.scoped = this.root.requestContext;
        this.ownId = this.fields?.reqId !== undefined;
    }

    /** A logger for a module: its name appears in each line and selects its level. Nested names join with ".". */
    child(module: string): Logger {
        const name = this.module === undefined ? module : `${this.module}.${module}`;
        return new Logger({}, { root: this.root, module: name, fields: this.fields });
    }

    /** A logger that adds these fields to every line. */
    with(fields: Readonly<Record<string, unknown>>): Logger {
        return new Logger({}, { root: this.root, module: this.module, fields: { ...this.fields, ...fields } });
    }

    /** True when this level would be logged: guard expensive fields with it. */
    enabled(level: LogLevel): boolean {
        return RANK[level] >= this.min;
    }

    trace(msg: string, fields?: LogFields): void {
        if (this.min <= 10) this.emit("trace", msg, fields);
    }

    debug(msg: string, fields?: LogFields): void {
        if (this.min <= 20) this.emit("debug", msg, fields);
    }

    info(msg: string, fields?: LogFields): void {
        if (this.min <= 30) this.emit("info", msg, fields);
    }

    warn(msg: string, fields?: LogFields): void {
        if (this.min <= 40) this.emit("warn", msg, fields);
    }

    error(msg: string, fields?: LogFields): void {
        if (this.min <= 50) this.emit("error", msg, fields);
    }

    fatal(msg: string, fields?: LogFields): void {
        if (this.min <= 60) {
            this.emit("fatal", msg, fields);
            Logger.flush();
        }
    }

    /** True when the app logs one line per request. */
    get logsRequests(): boolean {
        return this.root.requests;
    }

    /** True when lines carry the id of the request being handled (`requestContext`). */
    get logsRequestContext(): boolean {
        return this.root.requestContext;
    }

    /** Writes what the default stdout output still buffers. Sparkus calls it on shutdown and exit. */
    static flush(): void {
        stdoutSink.flush();
    }

    /**
     * Engine fast path (request log lines): `json` is the fields already serialized
     * (`,"key":value...`) and `msg` needs no escaping; `fields` builds them for pretty lines.
     * The caller checked the level with `enabled()`.
     */
    emitPrebuilt(level: LogLevel, msg: string, json: string, fields: () => LogFields): void {
        try {
            this.root.write(
                this.root.pretty
                    ? this.prettyLine(level, msg, fields(), undefined)
                    : `{"level":"${level}","time":${Date.now()}${this.bound},"msg":"${msg}"${json}}`,
            );
        } catch {
            // Logging never breaks the request that logs.
        }
    }

    private emit(level: LogLevel, msg: string, fields: LogFields | undefined): void {
        const text = typeof msg === "string" ? msg : String(msg);
        try {
            const ctx = this.scoped ? scope?.getStore() : undefined;
            if (this.root.pretty) this.root.write(this.prettyLine(level, text, fields, ctx));
            else {
                const request = ctx === undefined ? "" : this.requestJson(ctx, fields);
                this.root.write(
                    `{"level":"${level}","time":${Date.now()}${this.bound}${request},"msg":${JSON.stringify(text)}${fieldsJson(fields)}}`,
                );
            }
        } catch {
            // Logging never breaks the request that logs.
        }
    }

    /** True when the line names its request already: `ctx.log`, or a `reqId` field. */
    private named(fields: LogFields | undefined): boolean {
        return this.ownId || (isFieldObject(fields) && fields.reqId !== undefined);
    }

    /** `,"reqId":"...","trace_id":"...","span_id":"..."` for a line logged while `ctx` is handled. */
    private requestJson(ctx: RequestContext, fields: LogFields | undefined): string {
        // Request ids are safe tokens (validated or generated): no escaping.
        let out = this.named(fields) ? "" : `,"reqId":"${ctx.requestId}"`;
        const ids = traceIds(ctx);
        if (ids !== undefined) out += `,"trace_id":${JSON.stringify(ids.traceId)},"span_id":${JSON.stringify(ids.spanId)}`;
        return out;
    }

    private prettyLine(level: LogLevel, msg: string, fields: LogFields | undefined, ctx: RequestContext | undefined): string {
        const { color } = this.root;
        const tag = level.toUpperCase().padEnd(5);
        let line = `${time(new Date())} ${color ? `${COLORS[level]}${tag}\x1b[0m` : tag}`;
        if (this.module !== undefined) line += color ? ` \x1b[1m${this.module}\x1b[0m` : ` ${this.module}`;
        line += ` ${msg}`;
        let request: Record<string, unknown> | undefined;
        if (ctx !== undefined) {
            request = this.named(fields) ? {} : { reqId: ctx.requestId };
            const ids = traceIds(ctx);
            if (ids !== undefined) {
                request.trace_id = ids.traceId;
                request.span_id = ids.spanId;
            }
        }
        const all: Record<string, unknown> = {
            ...this.fields,
            ...request,
            ...(fields === undefined ? undefined : isFieldObject(fields) ? fields : { err: fields }),
        };
        let stack = "";
        for (const key in all) {
            const value = all[key];
            if (value === undefined) continue;
            line += color ? ` \x1b[90m${key}=\x1b[0m${prettyValue(value)}` : ` ${key}=${prettyValue(value)}`;
            if (value instanceof Error && value.stack !== undefined) stack += "\n    " + value.stack.split("\n").join("\n    ");
        }
        return line + stack;
    }
}
