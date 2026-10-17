import { compileRoutes, type CompiledRoute } from "./compile.js";
import type { HttpMethod } from "./context.js";
import { Container, type Class, type Provider, type Token } from "./di.js";
import { ErrorCode, SparkusError } from "./errors.js";
import type { GuardLike, InterceptorLike } from "./pipeline.js";
import { generateOpenApi, type OpenApiOptions } from "./openapi.js";
import { AppRuntime, type ErrorMapper, type Logger } from "./runtime.js";
import { createFetchHandler } from "./web.js";

/** An HTTP engine: plugs the compiled routes into a server. */
export interface Engine {
    readonly name: string;
    listen(runtime: AppRuntime, options: { port: number; hostname: string }): Promise<EngineServer>;
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
    /** Maximum JSON body size in bytes. Default: 1 MiB. */
    bodyLimit?: number;
    /** Where unexpected errors are logged. Default: console. */
    logger?: Logger;
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

    constructor(private readonly options: AppOptions) {
        for (const provider of options.providers ?? []) this.container.provide(provider);
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
        const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
        const routes = compileRoutes(
            {
                controllers: options.controllers,
                guards: options.guards ?? [],
                interceptors: options.interceptors ?? [],
                bodyLimit,
            },
            this.container,
        );
        const runtime = new AppRuntime(routes, {
            bodyLimit,
            exposeErrors: options.exposeErrors ?? defaultExposeErrors(),
            onError: options.onError,
            logger: options.logger ?? { error: (message, error) => console.error(message, error) },
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
        return generateOpenApi(this.requireRuntime("openapi()").routes, options);
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
        const port = options.port ?? Number(globalThis.process?.env?.PORT ?? 3000);
        const hostname = options.hostname ?? "0.0.0.0";
        this.shutdownTimeout = options.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT;
        this.server = await engine.listen(this.runtime!, { port, hostname });

        const signals = options.signals ?? DEFAULT_SIGNALS;
        if (signals !== false && signals.length > 0) this.handleSignals(signals);

        const shown = hostname === "0.0.0.0" || hostname === "::" ? "localhost" : hostname;
        return {
            engine: engine.name,
            port: this.server.port,
            hostname: this.server.hostname,
            url: `http://${shown}:${this.server.port}`,
        };
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
            this.close().then(
                () => process.kill(process.pid, signal),
                (error) => {
                    (this.options.logger ?? console).error("[sparkus] Shutdown failed", error);
                    process.exit(1);
                },
            );
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

/** Creates an application. Nothing is resolved until init() or listen(). */
export function createApp(options: AppOptions): SparkusApp {
    return new SparkusApp(options);
}
