import { config, t } from "sparkus";

// Environment variables, typed and checked at startup: a missing or invalid one stops the app
// with SPK1018, which lists them all. Bun reads .env itself. Read with inject(AppConfig).
// Tests replace values with AppConfig.override({ ... }).
export const AppConfig = config(
    {
        PORT: t.integer({ min: 0, max: 65535, default: 3000 }),
        // Behind a load balancer, a few seconds: it stops sending traffic once /ready fails.
        SHUTDOWN_DELAY: t.integer({ min: 0, default: 0 }),
        // HS256 key for the JWTs. The default is for development only.
        JWT_SECRET: t.string({ min: 16, default: "conduit-development-secret" }),
        // Articles seeded at startup for load tests (0: none).
        CONDUIT_SEED: t.integer({ min: 0, default: 0 }),
    },
    { name: "AppConfig" },
);
