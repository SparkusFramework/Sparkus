import { ErrorCode, SparkusError } from "./errors.js";

/** A class Sparkus can construct: no constructor arguments, dependencies come from `inject()`. */
export type Class<T = unknown> = new () => T;

declare const TYPE: unique symbol;

/** A token for values that are not classes (config, interfaces, primitives). Create it with `token()`. */
export interface InjectionToken<T> {
    readonly name: string;
    readonly factory: (() => T) | undefined;
    /** Phantom member carrying the type, never set at runtime. */
    readonly [TYPE]?: T;
}

export type Token<T = unknown> = Class<T> | InjectionToken<T>;

/**
 * Creates a token for a value that is not a class. Give it a factory for a
 * default value, or register a provider for it.
 *
 *     export const DATABASE_URL = token<string>("DATABASE_URL");
 *     createApp({ controllers, providers: [{ provide: DATABASE_URL, useValue: process.env.DATABASE_URL! }] });
 */
export function token<T>(name: string, factory?: () => T): InjectionToken<T> {
    return Object.freeze({ name, factory }) as InjectionToken<T>;
}

/** Replaces what the container builds for a token. Registered before startup, typically in tests. */
export type Provider<T = any> =
    | { provide: Token<T>; useValue: T }
    | { provide: Token<T>; useClass: Class<T> }
    | { provide: Token<T>; useFactory: () => T };

/** Called once at startup, after every dependency is constructed, dependencies first. May be async. */
export interface OnInit {
    onInit(): void | Promise<void>;
}

/** Called once at shutdown, after the server stopped accepting requests, in reverse startup order. */
export interface OnShutdown {
    onShutdown(): void | Promise<void>;
}

let active: Container | undefined;

function tokenName(token: Token): string {
    return token.name || "<anonymous>";
}

/** The message of a caught error, ending with a period so a fix can follow it. */
function reason(error: unknown): string {
    const message = (error instanceof Error ? error.message : String(error)).trim();
    return /[.!?]$/.test(message) ? message : `${message}.`;
}

/**
 * Resolves a dependency while Sparkus constructs a controller, a service, a
 * guard or an interceptor. Use it in a field initializer or in a constructor:
 *
 *     private readonly users = inject(UserService);
 */
export function inject<T>(token: Token<T>): T {
    if (active === undefined) {
        throw new SparkusError(
            ErrorCode.InjectOutsideConstruction,
            `inject(${tokenName(token)}) called outside a construction managed by Sparkus. ` +
                `Call it in a field initializer (private readonly x = inject(${tokenName(token)})) or a constructor, ` +
                "not at module level or in a method.",
        );
    }
    return active.get(token);
}

/**
 * Singleton container. Everything is resolved once at startup, so the request
 * path never touches it.
 */
export class Container {
    private readonly instances = new Map<Token, unknown>();
    private readonly providers = new Map<Token, Provider>();
    private readonly resolving: Token[] = [];
    /** Instances the container built (not `useValue`), in creation order: dependencies come first. */
    private readonly created: object[] = [];
    private initialized = false;

    /** Registers a provider. Must happen before the token is first resolved. */
    provide(provider: Provider): void {
        const token = provider.provide;
        if (this.instances.has(token)) {
            throw new SparkusError(
                ErrorCode.ProviderAfterResolution,
                `Provider for ${tokenName(token)} registered after ${tokenName(token)} was resolved. ` +
                    "Register providers and overrides before init() or listen().",
            );
        }
        this.providers.set(token, provider);
    }

    has(token: Token): boolean {
        return this.instances.has(token);
    }

    get<T>(token: Token<T>): T {
        if (this.instances.has(token)) return this.instances.get(token) as T;

        if (this.resolving.includes(token)) {
            const start = this.resolving.indexOf(token);
            const cycle = [...this.resolving.slice(start), token].map(tokenName).join(" -> ");
            const reached = start > 0 ? `, reached from ${this.resolving.slice(0, start).map(tokenName).join(" -> ")}` : "";
            throw new SparkusError(
                ErrorCode.DependencyCycle,
                `Dependency cycle: ${cycle}${reached}. Move what both need into a third service.`,
            );
        }

        const provider = this.providers.get(token);
        if (provider !== undefined && "useValue" in provider) {
            this.instances.set(token, provider.useValue);
            return provider.useValue as T;
        }

        const previous = active;
        active = this;
        this.resolving.push(token);
        let instance: T;
        try {
            instance = this.build(token, provider);
        } catch (error) {
            if (error instanceof SparkusError) throw error;
            const path = this.resolving.map(tokenName).join(" -> ");
            throw new SparkusError(
                ErrorCode.ConstructionFailed,
                `Could not construct ${tokenName(token)} (${path}): ${reason(error)} ` +
                    "Fix the constructor (see cause); do I/O in onInit(), not in the constructor.",
                { cause: error },
            );
        } finally {
            this.resolving.pop();
            active = previous;
        }

        this.instances.set(token, instance);
        if (typeof instance === "object" && instance !== null) {
            this.created.push(instance);
            if (this.initialized && typeof (instance as Partial<OnInit>).onInit === "function") {
                throw new SparkusError(
                    ErrorCode.LateLifecycle,
                    `${tokenName(token)} has onInit() but was first resolved after startup, so it never ran. ` +
                        "Inject it at startup, or resolve it with app.get() before listen().",
                );
            }
        }
        return instance;
    }

    private build<T>(token: Token<T>, provider: Provider<T> | undefined): T {
        if (provider !== undefined) {
            if ("useClass" in provider) return this.construct(provider.useClass);
            return (provider as { useFactory: () => T }).useFactory();
        }
        if (typeof token === "function") return this.construct(token);
        if (token.factory !== undefined) return token.factory();
        const neededBy = this.resolving.slice(0, -1).map(tokenName).join(" -> ");
        throw new SparkusError(
            ErrorCode.NoProvider,
            `No provider for token ${token.name}${neededBy ? ` (needed by ${neededBy})` : ""}. ` +
                `Add { provide: ${token.name}, useValue: ... } to providers in createApp() and createTestApp(), ` +
                `or give the token a default: token("${token.name}", () => ...).`,
        );
    }

    private construct<T>(type: Class<T>): T {
        // Constructor injection (NestJS style) would get undefined arguments and fail on the
        // first request; refuse it at startup instead.
        if (type.length > 0) {
            const path = this.resolving.length > 1 ? ` (${this.resolving.map(tokenName).join(" -> ")})` : "";
            throw new SparkusError(
                ErrorCode.ConstructionFailed,
                `${type.name || "<anonymous>"} has constructor parameters${path}, but Sparkus constructs classes without ` +
                    "arguments. Declare dependencies as fields instead: private readonly users = inject(UserService).",
            );
        }
        return new type();
    }

    /** Runs every `onInit()` hook, dependencies first. */
    async init(): Promise<void> {
        for (let i = 0; i < this.created.length; i++) {
            const instance = this.created[i] as Partial<OnInit>;
            if (typeof instance.onInit !== "function") continue;
            try {
                await instance.onInit();
            } catch (error) {
                throw new SparkusError(
                    ErrorCode.LifecycleFailed,
                    `${instance.constructor.name}.onInit() failed: ${reason(error)} ` +
                        "Fix the hook (see cause), or catch the error inside it if the app can start without it.",
                    { cause: error },
                );
            }
        }
        this.initialized = true;
    }

    /** Runs every `onShutdown()` hook in reverse order. Never stops at a failure: returns the errors instead. */
    async shutdown(): Promise<unknown[]> {
        const errors: unknown[] = [];
        for (let i = this.created.length - 1; i >= 0; i--) {
            const instance = this.created[i] as Partial<OnShutdown>;
            if (typeof instance.onShutdown !== "function") continue;
            try {
                await instance.onShutdown();
            } catch (error) {
                errors.push(error);
            }
        }
        return errors;
    }
}
