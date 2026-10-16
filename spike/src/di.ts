import { SparkusError } from "./errors.js";

export type Token<T> = new () => T;

let active: Container | undefined;

/**
 * Resolves a dependency while Sparkus constructs a controller or service.
 * Use it in a field initializer or in a constructor:
 *
 *     users = inject(UserService);
 */
export function inject<T>(token: Token<T>): T {
    if (active === undefined) {
        throw new SparkusError(
            "SPK1001",
            `inject(${token.name}) was called outside of a Sparkus-managed construction. ` +
                "Call it in a field initializer or constructor of a class that Sparkus creates " +
                "(a controller, or a service injected into one), never at module level or inside a method.",
        );
    }
    return active.get(token);
}

/**
 * Singleton container. Everything is resolved once at startup, so the request
 * path never touches the container.
 */
export class Container {
    private readonly instances = new Map<Function, unknown>();
    private readonly resolving: Function[] = [];

    get<T>(token: Token<T>): T {
        const existing = this.instances.get(token);
        if (existing !== undefined) return existing as T;

        if (this.resolving.includes(token)) {
            const cycle = [...this.resolving.slice(this.resolving.indexOf(token)), token];
            throw new SparkusError(
                "SPK1002",
                `Dependency cycle: ${cycle.map((t) => t.name).join(" -> ")}. ` +
                    "Break it by moving the shared logic into a third service.",
            );
        }

        const previous = active;
        active = this;
        this.resolving.push(token);
        try {
            const instance = new token();
            this.instances.set(token, instance);
            return instance;
        } finally {
            this.resolving.pop();
            active = previous;
        }
    }

    /** Replaces a dependency, typically with a fake in tests. Call before startup. */
    set<T>(token: Token<T>, instance: T): void {
        this.instances.set(token, instance);
    }
}
