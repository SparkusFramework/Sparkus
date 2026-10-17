// Shape of the generated "large app" used by bench/startup.ts: ROUTES routes
// (env, default 1000) as REST resources of 5 routes each, plus GET /.
// Plain JS, no decorator syntax, so Node runs it without a build step.
export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = "127.0.0.1";
export const ROUTES = Number(process.env.ROUTES ?? 1000);
export const RESOURCES = Math.max(1, Math.round(ROUTES / 5));

/** Tells the startup runner when the app's own code began, and how long each phase took. */
export function report(phases) {
    if (process.env.STARTUP_REPORT) process.stdout.write(JSON.stringify(phases) + "\n");
}
