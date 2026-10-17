/**
 * Cold start and memory: for each target, time from spawn to the first 200
 * on GET /, then resident memory once the first response is served. Targets
 * are interleaved and shuffled on every run; medians are reported. The
 * baseline for the future `sparkus build` (AOT).
 *
 *   bun startup.ts [--runs 10] [--targets a,b] [--routes 100,1000]
 *
 * Small targets are the bench's own (3 routes); "large-*" targets are
 * generated apps (targets/large/) with --routes routes each. NODE_BIN selects
 * Node. Takes the machine-wide bench lock.
 */
import { join } from "node:path";
import { acquireMachineLock } from "./system.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);

const runs = Number(args.get("runs") ?? 10);
const routeCounts = (args.get("routes") ?? "100,1000").split(",").map(Number);
const nodeBin = process.env.NODE_BIN ?? "node";
const benchDir = import.meta.dir;

interface StartupTarget {
    name: string;
    runtime: "bun" | "node";
    entry: string;
    routes?: number;
}

const small: StartupTarget[] = [
    { name: "bun-raw", runtime: "bun", entry: "targets/bun-raw/server.js" },
    { name: "sparkus-bun", runtime: "bun", entry: "targets/sparkus/server.ts" },
    { name: "elysia", runtime: "bun", entry: "targets/elysia/server.ts" },
    { name: "node-raw", runtime: "node", entry: "targets/node-raw/server.js" },
    { name: "sparkus-node", runtime: "node", entry: "targets/sparkus/dist/server.js" },
    { name: "fastify", runtime: "node", entry: "targets/fastify/server.js" },
    { name: "nest-fastify", runtime: "node", entry: "targets/nest/dist/fastify.js" },
    { name: "nest-express", runtime: "node", entry: "targets/nest/dist/express.js" },
];
const large: StartupTarget[] = routeCounts.flatMap((routes) => [
    { name: `large-sparkus-bun-${routes}`, runtime: "bun" as const, entry: "targets/large/sparkus.js", routes },
    { name: `large-elysia-${routes}`, runtime: "bun" as const, entry: "targets/large/elysia.js", routes },
    { name: `large-sparkus-node-${routes}`, runtime: "node" as const, entry: "targets/large/sparkus.js", routes },
    { name: `large-fastify-${routes}`, runtime: "node" as const, entry: "targets/large/fastify.js", routes },
]);
const wanted = args.get("targets")?.split(",");
const all = [...small, ...large];
const targets = wanted ? all.filter((x) => wanted.some((w) => x.name === w || x.name.startsWith(w + "-"))) : all;
if (targets.length === 0) throw new Error(`No target matches ${wanted}`);

function memory(pid: number): number {
    if (process.platform === "win32") {
        const out = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `(Get-Process -Id ${pid}).WorkingSet64`]);
        return Number(out.stdout.toString().trim());
    }
    const status = require("node:fs").readFileSync(`/proc/${pid}/status`, "utf8") as string;
    return Number(/VmRSS:\s+(\d+)/.exec(status)![1]) * 1024;
}

interface Sample {
    firstResponseMs: number;
    rss: number;
    phases: Record<string, number> | null;
}

let nextPort = 4600;
async function once(target: StartupTarget): Promise<Sample> {
    const port = nextPort++;
    const bin = target.runtime === "bun" ? process.execPath : nodeBin;
    const env: Record<string, string> = { ...(process.env as Record<string, string>), PORT: String(port), NODE_ENV: "production", STARTUP_REPORT: "1" };
    if (target.routes !== undefined) env.ROUTES = String(target.routes);
    const url = `http://127.0.0.1:${port}/`;

    const start = performance.now();
    const proc = Bun.spawn([bin, join(benchDir, target.entry)], { cwd: benchDir, env, stdout: "pipe", stderr: "pipe" });
    try {
        let firstResponseMs = NaN;
        while (performance.now() - start < 30_000) {
            if (proc.exitCode !== null) throw new Error(`${target.name} exited: ${await new Response(proc.stderr).text()}`);
            try {
                const res = await fetch(url, { keepalive: false });
                await res.arrayBuffer();
                if (res.status === 200) {
                    firstResponseMs = performance.now() - start;
                    break;
                }
            } catch {}
            await Bun.sleep(1);
        }
        if (Number.isNaN(firstResponseMs)) throw new Error(`${target.name} did not answer within 30 s`);
        await Bun.sleep(300);
        const rss = memory(proc.pid);
        proc.kill();
        const out = await new Response(proc.stdout).text();
        const line = out.split("\n").find((l) => l.startsWith("{"));
        return { firstResponseMs, rss, phases: line ? JSON.parse(line) : null };
    } finally {
        proc.kill();
        await proc.exited;
    }
}

const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
};
const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

await acquireMachineLock();
const nodeVersion = Bun.spawnSync([nodeBin, "-v"]).stdout.toString().trim();
console.log(`Startup: ${targets.length} targets x ${runs} runs, Bun ${Bun.version}, Node ${nodeVersion}`);

// One warm-up start per target: fills the OS file cache, so run 1 is not an outlier.
for (const target of targets) await once(target);
const samples = new Map<string, Sample[]>(targets.map((x) => [x.name, []]));
for (let run = 0; run < runs; run++) for (const target of shuffle(targets)) samples.get(target.name)!.push(await once(target));

const lines = [
    "| Cible | Runtime | 1re réponse (ms) | min–max | RSS après démarrage (Mo) | phases Sparkus (ms) |",
    "|---|---|---:|---:|---:|---|",
];
for (const target of targets) {
    const mine = samples.get(target.name)!;
    const times = mine.map((s) => s.firstResponseMs);
    const phases = mine[0]!.phases
        ? Object.keys(mine[0]!.phases)
              .map((key) => `${key} ${median(mine.map((s) => s.phases![key]!)).toFixed(1)}`)
              .join(", ")
        : "";
    lines.push(
        `| ${target.name} | ${target.runtime} | ${median(times).toFixed(0)} | ${Math.min(...times).toFixed(0)}–${Math.max(...times).toFixed(0)} | ` +
            `${(median(mine.map((s) => s.rss)) / 2 ** 20).toFixed(1)} | ${phases} |`,
    );
}
console.log(lines.join("\n"));
