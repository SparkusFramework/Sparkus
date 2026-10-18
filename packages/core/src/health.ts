import { parsePath, type CompiledRoute } from "./compile.js";
import type { RequestContext } from "./context.js";
import type { Container } from "./di.js";
import { ErrorCode, PROBLEM_TYPE, SparkusError } from "./errors.js";
import type { AppRuntime } from "./runtime.js";

export interface HealthOptions {
    /** Liveness: 200 while the process serves requests. Default: "/health". */
    path?: string;
    /** Readiness: 200 when every check passes, 503 while one fails or the app shuts down. Default: "/ready". */
    readyPath?: string;
    /** Milliseconds a check may take before it counts as failed. Default: 5 000. */
    timeout?: number;
}

/**
 * A service that knows whether the app can serve: a database pool, a queue client. Sparkus
 * finds every service implementing it; the readiness route calls them all, in parallel.
 *
 *     class Database implements HealthCheck {
 *         async checkHealth() { await this.pool.query("select 1"); }
 *     }
 */
export interface HealthCheck {
    /** Throw, or return false, when the service cannot serve. */
    checkHealth(): unknown;
}

const LIVE = Object.freeze({ status: "ok" });
const DEFAULT_TIMEOUT = 5_000;

function isHealthCheck(instance: object): instance is HealthCheck {
    return typeof (instance as Partial<HealthCheck>).checkHealth === "function";
}

/** Runs one check: "ok", or why it failed. */
function runCheck(check: HealthCheck, timeout: number): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(`timed out after ${timeout} ms`), timeout);
    });
    const result = (async () => {
        try {
            return (await check.checkHealth()) === false ? "returned false" : "ok";
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    })();
    return Promise.race([result, late]).finally(() => clearTimeout(timer));
}

function problem(ctx: RequestContext, detail: string, checks: Record<string, string>) {
    ctx.status = 503;
    ctx.setHeader("content-type", PROBLEM_TYPE);
    return { type: "about:blank", title: "Service Unavailable", status: 503, detail, code: ErrorCode.NotReady, checks };
}

function route(path: string, handlerName: string, run: CompiledRoute["run"]): CompiledRoute {
    return {
        method: "GET",
        path,
        paramNames: parsePath(path, handlerName),
        status: 200,
        handlerName,
        body: undefined,
        params: undefined,
        query: undefined,
        response: undefined,
        guards: 0,
        interceptors: 0,
        bodyLimit: 0,
        internal: true,
        run,
    };
}

/**
 * Liveness and readiness routes. No guard or interceptor runs on them: probes carry no token.
 * Failure details (error messages) are sent only when `exposeErrors` is on.
 */
export function healthRoutes(
    options: HealthOptions,
    container: Container,
    runtime: () => AppRuntime,
    exposeErrors: boolean,
): CompiledRoute[] {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    if (!Number.isSafeInteger(timeout) || timeout <= 0) {
        throw new SparkusError(ErrorCode.InvalidOption, `health.timeout ${timeout} is not a number of milliseconds. Use an integer > 0.`);
    }
    let checks: Array<[string, HealthCheck]> | undefined;

    const ready = async (ctx: RequestContext) => {
        if (runtime().draining) return problem(ctx, "The app is shutting down.", {});
        // Found on the first probe: every service exists once the app started.
        checks ??= container
            .built()
            .filter(isHealthCheck)
            .map((instance): [string, HealthCheck] => [instance.constructor.name, instance]);
        const results = await Promise.all(checks.map(([, check]) => runCheck(check, timeout)));
        const report: Record<string, string> = {};
        const failed: string[] = [];
        checks.forEach(([name], i) => {
            const result = results[i]!;
            if (result === "ok") report[name] = "ok";
            else {
                failed.push(name);
                report[name] = exposeErrors ? `error: ${result}` : "error";
            }
        });
        if (failed.length > 0) return problem(ctx, `Not ready: ${failed.join(", ")} failed.`, report);
        return { status: "ok", checks: report };
    };

    return [
        route(options.path ?? "/health", "Sparkus.health", () => LIVE),
        route(options.readyPath ?? "/ready", "Sparkus.ready", ready),
    ];
}
