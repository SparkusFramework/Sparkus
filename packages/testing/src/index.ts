import { createApp, type AppOptions, type Provider, type SparkusApp, type Token } from "@sparkus/core";

export interface TestAppOptions extends Omit<AppOptions, "engine"> {
    /** Providers that replace real dependencies (fakes, stubs). Applied after `providers`. */
    overrides?: readonly Provider[];
}

export interface InjectOptions {
    method?: string;
    /** Path with an optional query string: "/users/42?fields=name". */
    url: string;
    headers?: Record<string, string>;
    /** Objects and arrays are sent as JSON (with content-type: application/json); strings and bytes as is. */
    body?: unknown;
}

export interface InjectResponse {
    status: number;
    headers: Headers;
    /** Raw body text. */
    text: string;
    /** Body parsed as JSON. Throws when it is not JSON. */
    json<T = any>(): T;
}

/** An initialized app driven in memory: no port, no socket, same pipeline as production. */
export class TestApp {
    constructor(readonly app: SparkusApp) {}

    /** Sends a request through the full pipeline (routing, guards, interceptors, validation, errors). */
    async inject(options: InjectOptions): Promise<InjectResponse> {
        const headers = new Headers(options.headers);
        let body: RequestInit["body"];
        const raw = options.body;
        if (raw === undefined || raw === null) {
            body = undefined;
        } else if (typeof raw === "string" || raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
            body = raw as RequestInit["body"];
        } else {
            body = JSON.stringify(raw);
            if (!headers.has("content-type")) headers.set("content-type", "application/json");
        }

        const response = await this.app.fetch(
            new Request(new URL(options.url, "http://sparkus.test").href, {
                method: options.method ?? "GET",
                headers,
                body,
            }),
        );
        const text = await response.text();
        return {
            status: response.status,
            headers: response.headers,
            text,
            json: () => JSON.parse(text),
        };
    }

    /** Resolves a singleton, e.g. a fake to inspect what it received. */
    get<T>(token: Token<T>): T {
        return this.app.get(token);
    }

    /** Runs the onShutdown hooks. */
    close(): Promise<void> {
        return this.app.close();
    }
}

/**
 * Builds and initializes an app for tests, with dependencies replaced:
 *
 *     const t = await createTestApp({
 *         controllers: [UserController],
 *         overrides: [{ provide: UserRepository, useValue: fakeRepository }],
 *     });
 *     const res = await t.inject({ url: "/users/42" });
 */
export async function createTestApp(options: TestAppOptions): Promise<TestApp> {
    const { overrides = [], ...appOptions } = options;
    const app = createApp({ exposeErrors: true, ...appOptions });
    for (const provider of overrides) app.provide(provider);
    await app.init();
    return new TestApp(app);
}
