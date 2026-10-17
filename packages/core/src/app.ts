import { compileRoutes, type CompiledRoute } from "./compile.js";
import type { HttpMethod } from "./context.js";
import { Container, type Class, type Provider, type Token } from "./di.js";
import { ErrorCode, SparkusError } from "./errors.js";
import { healthRoutes, type HealthOptions } from "./health.js";
import { Logger, type LoggerOptions } from "./log.js";
import { Observer, type CorsOptions, type TelemetryOptions } from "./observe.js";
import type { GuardLike, InterceptorLike } from "./pipeline.js";
import { generateOpenApi, type OpenApiOptions } from "./openapi.js";
import { AppRuntime, type ErrorMapper } from "./runtime.js";
import { createFetchHandler } from "./web.js";

/** What an engine receives to start its server. */
export interface EngineListenOptions {
    port: number;
    hostname: string;
    /** Milliseconds an idle keep-alive connection stays open; undefined for the engine's default. */
    idleTimeout: number | undefined;
}

/** An HTTP engine: plugs the compiled routes into a server. */
export interface Engine {
    readonly name: string;
    listen(runtime: AppRuntime, options: EngineListenOptions): Promise<EngineServer>;
}

export interface EngineServer {
    readonly port: number;
    readonly hostname: string;
    /**
     * Stops accepting connections. `force: false` lets in-flight requests
     * finish; `force: true` closes every connection now. Resolves once closed.
     */
    stop(force: boolean): Promise<void>;
}

export interface AppOptions {
    /** Controller classes. Each must have @Controller(). */
    controllers: readonly Class<object>[];
    /** Replaces what the container builds for some tokens (config values, fakes, alternative classes). */
    providers?: readonly Provider[];
    /** Guards run before every route, before controller and route guards. */
    guards?: readonly GuardLike[];
    /** Interceptors wrapped around every route, outside controller and route interceptors. */
    interceptors?: readonly InterceptorLike[];
    /** Maps errors before they are rendered (e.g. a database conflict to a 409). */
    onError?: ErrorMapper;
    /**
     * Send the message of unexpected errors in 500 responses. Stacks are never
     * sent. Default: on when NODE_ENV is "development" or "test", off otherwise.
     */
    exposeErrors?: boolean;
    /** Maximum JSON body size in bytes. Default: 1 MiB. Route option `bodyLimit` overrides it. */
    bodyLimit?: number;
    /**
     * Milliseconds a request may take (body, guards, interceptors, handler) before the client
     * gets 503 SPK2008 and `ctx.signal` aborts. Route option `timeout` overrides it. Default: none.
     */
    requestTimeout?: number;
    /**
     * Logging: level (default LOG_LEVEL, else "info"), levels per module, format, one line per
     * request (`requests: true`). `false` logs nothing. Inject the logger: `inject(Logger).child("users")`.
     */
    logger?: LoggerOptions | false;
    /** Cross-origin requests from browsers: `true` allows any origin (without credentials). */
    cors?: CorsOptions | true;
    /**
     * Security headers on every response (CSP, HSTS, nosniff...), see SECURITY_HEADERS. `true`
     * for the defaults; an object overrides some by lowercase name, `false` drops one.
     */
    securityHeaders?: boolean | Readonly<Record<string, string | false>>;
    /**
     * Echo the request id in a response header (default "x-request-id"), read from the same
     * header when the client sends one. `ctx.requestId` works either way.
     */
    requestId?: boolean | { header?: string };
    /** Liveness ("/health") and readiness ("/ready") routes. Readiness runs every `HealthCheck` service. */
    health?: boolean | HealthOptions;
    /** OpenTelemetry tracer and meter (from `@opentelemetry/api`, no SDK dependency here). */
    telemetry?: TelemetryOptions;
    /** HTTP engine, or a function loading it. The `sparkus` package picks Bun or Node automatically. */
    engine?: Engine | (() => Engine | Promise<Engine>);
}

export interface ListenOptions {
    /** Default: the PORT environment variable, else 3000. Use 0 for a random free port. */
    port?: number;
    /** Default: "0.0.0.0". */
    hostname?: string;
    /**
     * Signals that trigger a graceful shutdown (stop accepting, drain, run
     * onShutdown hooks, exit). Default: SIGINT and SIGTERM. `false` to handle them yourself.
     */
    signals?: readonly NodeJS.Signals[] | false;
    /** Milliseconds to wait for in-flight requests before closing connections. Default: 10 000. */
    shutdownTimeout?: number;
    /**
     * Milliseconds to keep serving after a shutdown signal, with readiness failing, before the
     * server stops accepting: load balancers notice and stop sending traffic. Default: 0.
     */
    shutdownDelay?: number;
    /**
     * Milliseconds an idle keep-alive connection stays open. Behind a load balancer, set it
     * above the balancer's idle timeout. Default: the engine's (Bun 10 s, Node 5 s).
     */
    idleTimeout?: number;
}

export interface ListeningInfo {
    engine: string;
    port: number;
    hostname: string;
    url: string;
}

/** Public description of a route, for tooling (CLI, OpenAPI, agents). */
export interface RouteInfo {
    method: HttpMethod;
    path: string;
    handler: string;
    status: number;
    body: boolean;
    guards: number;
    interceptors: number;
}

const DEFAULT_BODY_LIMIT = 1024 * 1024;
const DEFAULT_REQUEST_ID_HEADER = "x-request-id";
const DEFAULT_SHUTDOWN_TIMEOUT = 10_000;
const DEFAULT_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

function defaultExposeErrors(): boolean {
    const env = globalThis.process?.env?.NODE_ENV;
    return env === "development" || env === "test";
}

export class SparkusApp {
    readonly container = new Container();
    private runtime: AppRuntime | undefined;
    private ready: Promise<void> | undefined;
    private server: EngineServer | undefined;
    private closing: Promise<void> | undefined;
    private handleFetch: ((request: Request) => Promise<Response>) | undefined;
    private removeSignalHandlers: (() => void) | undefined;
    private shutdownTimeout = DEFAULT_SHUTDOWN_TIMEOUT;
    private shutdownDelay = 0;
    private log: Logger | undefined;

    constructor(private readonly options: AppOptions) {
        for (const provider of options.providers ?? []) this.container.provide(provider);
    }

    /** The app's logger: the one provided for `Logger`, else one built from the `logger` option. */
    private logger(): Logger {
        if (this.log === undefined) {
            if (!this.container.provided(Logger)) {
                const options = this.options.logger;
                this.container.provide({ provide: Logger, useValue: new Logger(options === false ? { level: "silent" } : options) });
            }
            this.log = this.container.get(Logger);
        }
        return this.log;
    }

    /** Registers a provider (e.g. a fake in a test). Must happen before init() or listen(). */
    provide(provider: Provider): this {
        this.container.provide(provider);
        return this;
    }

    /** Resolves a singleton from the container. */
    get<T>(token: Token<T>): T {
        return this.container.get(token);
    }

    /**
     * Resolves controllers and their dependencies, compiles every route, then
     * runs the onInit hooks. Fails fast on any wiring error. Idempotent;
     * listen() calls it.
     */
    init(): Promise<void> {
        return (this.ready ??= this.boot());
    }

    private async boot(): Promise<void> {
        const options = this.options;
        const log = this.logger();
        const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
        // Checked under their own names: a bad app value must not be blamed on the first route.
        checkInteger("bodyLimit", bodyLimit, "bytes");
        checkInteger("requestTimeout", options.requestTimeout ?? 0, "milliseconds");
        const exposeErrors = options.exposeErrors ?? defaultExposeErrors();
        const routes = compileRoutes(
            {
                controllers: options.controllers,
                guards: options.guards ?? [],
                interceptors: options.interceptors ?? [],
                bodyLimit,
                timeout: options.requestTimeout ?? 0,
            },
            this.container,
        );
        if (options.health !== undefined && options.health !== false) {
            const health = healthRoutes(options.health === true ? {} : options.health, this.container, () => runtime, exposeErrors);
            for (const route of health) {
                const taken = routes.find((r) => r.method === "GET" && r.path === route.path);
                if (taken !== undefined) {
                    throw new SparkusError(
                        ErrorCode.DuplicateRoute,
                        `GET ${route.path} is declared by ${taken.handlerName} and by the health option. ` +
                            "Remove the route, or move the probe: health: { path, readyPath }.",
                    );
                }
                routes.push(route);
            }
        }

        const requestId = options.requestId;
        const requestIdHeader = (typeof requestId === "object" ? requestId.header : undefined)?.toLowerCase() ?? DEFAULT_REQUEST_ID_HEADER;
        const security = options.securityHeaders;
        const observing = {
            log,
            // A request log its level silences would keep every request on the observed path for nothing.
            requests: log.logsRequests && log.child("http").enabled("info"),
            cors: options.cors === true ? { origin: "*" as const } : options.cors,
            securityHeaders: security === true ? {} : security === false ? undefined : security,
            echoRequestId: requestId === undefined || requestId === false ? null : requestIdHeader,
            telemetry: options.telemetry,
        };

        const runtime: AppRuntime = new AppRuntime(routes, {
            bodyLimit: routes.reduce((max, route) => Math.max(max, route.bodyLimit), bodyLimit),
            exposeErrors,
            onError: options.onError,
            log,
            requestIdHeader,
            observer: Observer.needed(observing) ? new Observer(observing) : null,
        });
        // Validates the route table (parameter conflicts) before anything starts.
        this.handleFetch = createFetchHandler(runtime);
        await this.container.init();
        this.runtime = runtime;
    }

    /** Compiled routes. Available after init(). */
    get routes(): RouteInfo[] {
        return this.requireRuntime("routes").routes.map((route: CompiledRoute) => ({
            method: route.method,
            path: route.path,
            handler: route.handlerName,
            status: route.status,
            body: route.body !== undefined,
            guards: route.guards,
            interceptors: route.interceptors,
        }));
    }

    /** OpenAPI 3.1 description of the routes, from their schemas. Available after init(). */
    openapi(options?: OpenApiOptions): Record<string, unknown> {
        return generateOpenApi(
            this.requireRuntime("openapi()").routes.filter((route) => !route.internal),
            options,
        );
    }

    /**
     * Web-standard handler: `Request -> Promise<Response>`. Works without a
     * server (tests, edge runtimes). Available after init().
     */
    readonly fetch = (request: Request): Promise<Response> => {
        if (this.handleFetch === undefined || this.runtime === undefined) {
            return Promise.reject(this.notInitialized("fetch()"));
        }
        return this.handleFetch(request);
    };

    /** Initializes the app if needed and starts the HTTP server. */
    async listen(options: ListenOptions = {}): Promise<ListeningInfo> {
        if (this.server !== undefined) {
            throw new SparkusError(ErrorCode.AlreadyListening, "listen() called twice on the same app. Create one app per server.");
        }
        await this.init();
        const engine = await this.loadEngine();
        const port = options.port ?? portFromEnv();
        const hostname = options.hostname ?? "0.0.0.0";
        this.shutdownTimeout = options.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT;
        this.shutdownDelay = options.shutdownDelay ?? 0;
        for (const [name, value] of [
            ["shutdownTimeout", this.shutdownTimeout],
            ["shutdownDelay", this.shutdownDelay],
            ["idleTimeout", options.idleTimeout ?? 0],
        ] as const) {
            if (!Number.isSafeInteger(value) || value < 0) {
                throw new SparkusError(ErrorCode.InvalidOption, `listen(): ${name} ${value} is not a number of milliseconds. Use an integer >= 0.`);
            }
        }
        this.server = await engine.listen(this.runtime!, { port, hostname, idleTimeout: options.idleTimeout });

        const signals = options.signals ?? DEFAULT_SIGNALS;
        if (signals !== false && signals.length > 0) this.handleSignals(signals);

        const shown = hostname === "0.0.0.0" || hostname === "::" ? "localhost" : hostname;
        const info = {
            engine: engine.name,
            port: this.server.port,
            hostname: this.server.hostname,
            url: `http://${shown}:${this.server.port}`,
        };
        this.logger().child("sparkus").info(`Listening on ${info.url}`, { engine: info.engine, port: info.port });
        return info;
    }

    /**
     * Graceful shutdown: stops accepting connections, lets in-flight requests
     * finish (up to `timeout` ms, then closes what is left), then runs the
     * onShutdown hooks in reverse startup order. Idempotent.
     */
    close(options: { timeout?: number } = {}): Promise<void> {
        return (this.closing ??= this.shutdown(options.timeout ?? this.shutdownTimeout));
    }

    private async shutdown(timeout: number): Promise<void> {
        this.removeSignalHandlers?.();
        if (this.runtime !== undefined) this.runtime.draining = true;
        const server = this.server;
        if (server !== undefined) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const forced = new Promise<void>((resolve) => {
                timer = setTimeout(() => resolve(server.stop(true)), timeout);
            });
            await Promise.race([server.stop(false), forced]);
            clearTimeout(timer);
        }
        if (this.ready !== undefined) await this.ready.catch(() => undefined);
        const errors = await this.container.shutdown();
        Logger.flush();
        if (errors.length > 0) {
            throw new AggregateError(errors, `[${ErrorCode.LifecycleFailed}] ${errors.length} onShutdown() hook(s) failed.`);
        }
    }

    private handleSignals(signals: readonly NodeJS.Signals[]): void {
        let received = false;
        const onSignal = (signal: NodeJS.Signals) => {
            if (received) {
                // Second signal: the user insists, stop waiting.
                process.exit(1);
            }
            received = true;
            const log = this.logger().child("sparkus");
            log.info(`${signal} received, shutting down`);
            if (this.runtime !== undefined) this.runtime.draining = true;
            const stop = () =>
                this.close().then(
                    () => {
                        Logger.flush();
                        process.kill(process.pid, signal);
                    },
                    (error) => {
                        log.fatal("Shutdown failed", error);
                        process.exit(1);
                    },
                );
            if (this.shutdownDelay > 0) setTimeout(stop, this.shutdownDelay);
            else stop();
        };
        for (const signal of signals) process.on(signal, onSignal);
        this.removeSignalHandlers = () => {
            for (const signal of signals) process.off(signal, onSignal);
        };
    }

    private async loadEngine(): Promise<Engine> {
        const engine = this.options.engine;
        if (engine === undefined) {
            throw new SparkusError(
                ErrorCode.NoEngine,
                'No HTTP engine. Import createApp from "sparkus" (it picks Bun or Node), or pass engine: nodeEngine().',
            );
        }
        return typeof engine === "function" ? await engine() : engine;
    }

    private requireRuntime(what: string): AppRuntime {
        if (this.runtime === undefined) throw this.notInitialized(what);
        return this.runtime;
    }

    private notInitialized(what: string): SparkusError {
        return new SparkusError(ErrorCode.NotInitialized, `${what} needs an initialized app: await app.init() first.`);
    }
}

function checkInteger(name: string, value: number, unit: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new SparkusError(ErrorCode.InvalidOption, `${name} ${value} is not a number of ${unit}. Use an integer >= 0.`);
    }
}

function portFromEnv(): number {
    const raw = globalThis.process?.env?.PORT;
    if (raw === undefined || raw === "") return 3000;
    const port = Number(raw);
    if (!/^\d+$/.test(raw.trim()) || port > 65535) {
        throw new SparkusError(
            ErrorCode.InvalidConfig,
            `PORT must be an integer from 0 to 65535. Fix the PORT environment variable, or pass listen({ port }).`,
        );
    }
    return port;
}

/** Creates an application. Nothing is resolved until init() or listen(). */
export function createApp(options: AppOptions): SparkusApp {
    return new SparkusApp(options);
}
