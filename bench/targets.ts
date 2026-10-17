export type Runtime = "bun" | "node";

export interface Target {
    name: string;
    runtime: Runtime;
    /** Entry file, relative to bench/. */
    entry: string;
    /** "ceiling" = raw server of the runtime, used as the 100 % reference. */
    role: "ceiling" | "sparkus" | "competitor";
    /** Extra environment variables of the server process. */
    env?: Record<string, string>;
}

export const targets: Target[] = [
    { name: "bun-raw", runtime: "bun", entry: "targets/bun-raw/server.js", role: "ceiling" },
    { name: "sparkus-bun", runtime: "bun", entry: "targets/sparkus/server.ts", role: "sparkus" },
    { name: "spike-bun", runtime: "bun", entry: "targets/spike/server.ts", role: "competitor" },
    { name: "elysia", runtime: "bun", entry: "targets/elysia/server.ts", role: "competitor" },
    { name: "hono-bun", runtime: "bun", entry: "targets/hono/server-bun.js", role: "competitor" },

    { name: "node-raw", runtime: "node", entry: "targets/node-raw/server.js", role: "ceiling" },
    { name: "sparkus-node", runtime: "node", entry: "targets/sparkus/dist/server.js", role: "sparkus" },
    { name: "spike-node", runtime: "node", entry: "targets/spike/dist/server.js", role: "competitor" },
    { name: "fastify", runtime: "node", entry: "targets/fastify/server.js", role: "competitor" },
    { name: "hono-node", runtime: "node", entry: "targets/hono/server-node.js", role: "competitor" },
    { name: "express", runtime: "node", entry: "targets/express/server.js", role: "competitor" },
    { name: "nest-fastify", runtime: "node", entry: "targets/nest/dist/fastify.js", role: "competitor" },
    { name: "nest-express", runtime: "node", entry: "targets/nest/dist/express.js", role: "competitor" },
];

/** Run only when named with --targets: guards and interceptors, for the "pipe-*" scenarios. */
export const extraTargets: Target[] = [
    { name: "sparkus-pipeline-bun", runtime: "bun", entry: "targets/sparkus-pipeline/server.ts", role: "sparkus" },
    { name: "sparkus-pipeline-node", runtime: "node", entry: "targets/sparkus-pipeline/dist/server.js", role: "sparkus" },
    // Production options on (request logs to stdout, security headers, request ids, CORS, health):
    // what they cost, measured against sparkus-bun / sparkus-node in the same session.
    { name: "sparkus-prod-bun", runtime: "bun", entry: "targets/sparkus/server.ts", role: "sparkus", env: { SPARKUS_BENCH_PROFILE: "production" } },
    { name: "sparkus-prod-node", runtime: "node", entry: "targets/sparkus/dist/server.js", role: "sparkus", env: { SPARKUS_BENCH_PROFILE: "production" } },
    // One production option at a time (Bun), to see what each costs.
    ...["logs", "security", "requestid", "cors"].map(
        (option): Target => ({
            name: `sparkus-${option}-bun`,
            runtime: "bun",
            entry: "targets/sparkus/server.ts",
            role: "sparkus",
            env: { SPARKUS_BENCH_OPTIONS: option },
        }),
    ),
    // Fastify with its logger (pino, one line at the start and one at the end of each request).
    { name: "fastify-logger", runtime: "node", entry: "targets/fastify/server.js", role: "competitor", env: { FASTIFY_LOGGER: "1" } },
];
