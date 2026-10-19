import { createApp, type AppOptions } from "sparkus";
import { realWorldErrors } from "./shared/errors.ts";

// Tests build the same app: createTestApp({ ...options, overrides }).
// Controllers are not listed: every *.controller.ts file under src/ is loaded at startup.
export const options: AppOptions = {
    // Values for token()s. Configuration is not one: it lives in src/config.ts.
    providers: [],
    // RealWorld error bodies: 422 for validation, an `errors` field on every error.
    onError: realWorldErrors,
    // One JSON line per request; LOG_LEVEL=debug (or info,users=debug) changes the levels.
    logger: { requests: true },
    // CSP, HSTS, nosniff... on every response. Add cors: { origin: [...] } for browser clients.
    securityHeaders: true,
    // x-request-id in every response, and in every log line of the request.
    requestId: true,
    // GET /health (liveness) and GET /ready (calls every service that implements HealthCheck).
    health: true,
    // 503 SPK2008 after 30 s; ctx.signal aborts. A route can set its own: { timeout: 60_000 }.
    requestTimeout: 30_000,
};

export default createApp(options);
