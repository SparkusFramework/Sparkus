export type Runtime = "bun" | "node";

export interface Target {
    name: string;
    runtime: Runtime;
    /** Entry file, relative to bench/. */
    entry: string;
    /** "ceiling" = raw server of the runtime, used as the 100 % reference. */
    role: "ceiling" | "sparkus" | "competitor";
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
