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
            `inject(${tokenName(token)}) was called outside of a Sparkus-managed construction. ` +
                "Call it in a field initializer or in the constructor of a class Sparkus creates " +
                "(controller, service, guard, interceptor), never at module level or inside a method.",
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
                `A provider for ${tokenName(token)} was registered after ${tokenName(token)} was already resolved. ` +
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
                `Dependency cycle: ${cycle}${reached}. ` +
                    "Break it by moving the logic both sides need into a third service.",
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
                `Could not construct ${tokenName(token)} (${path}): ${error instanceof Error ? error.message : String(error)}`,
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
                    `${tokenName(token)} has an onInit() hook but was first resolved after startup, so the hook would never run. ` +
                        "Inject it in a controller, guard, interceptor or service, or resolve it with app.get() before listen().",
                );
            }
        }
        return instance;
    }

    private build<T>(token: Token<T>, provider: Provider<T> | undefined): T {
        if (provider !== undefined) return "useClass" in provider ? new provider.useClass() : (provider as { useFactory: () => T }).useFactory();
        if (typeof token === "function") return new token();
        if (token.factory !== undefined) return token.factory();
        throw new SparkusError(
            ErrorCode.NoProvider,
            `No provider for token "${token.name}". Register one: providers: [{ provide: ${token.name}, useValue: ... }].`,
        );
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
                    `${instance.constructor.name}.onInit() failed: ${error instanceof Error ? error.message : String(error)}`,
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
