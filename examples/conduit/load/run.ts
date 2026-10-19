/**
 * Load test of the Conduit app: realistic routes (auth guard, nested response
 * schemas, lists of 20 articles, validated bodies) on the Bun and Node engines.
 *
 *   bun load/run.ts [--runtimes bun,node] [--scenarios a,b] [--rounds 3] [--duration 8] [--warmup 2]
 *                   [--connections 100] [--seed 1000] [--profile]
 *
 * Reuses the repo bench's machine lock, CPU pinning and autocannon (bench/).
 * --profile runs each runtime once per scenario under --cpu-prof and splits the
 * server's CPU between Sparkus (core + engine), the app, and the runtime.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { acquireMachineLock, cpuLayout, processStats, setAffinity } from "../../../bench/system.ts";

const root = resolve(import.meta.dir, "..");
const benchDir = resolve(root, "../../bench");
const autocannon = Bun.resolveSync("autocannon/autocannon.js", benchDir);
const nodeBin = process.env.NODE_BIN ?? "node";

const { values: args } = parseArgs({
    options: {
        runtimes: { type: "string", default: "bun,node" },
        scenarios: { type: "string" },
        rounds: { type: "string", default: "3" },
        duration: { type: "string", default: "8" },
        warmup: { type: "string", default: "2" },
        connections: { type: "string", default: "100" },
        seed: { type: "string", default: "1000" },
        profile: { type: "boolean", default: false },
        pin: { type: "string", default: "1" },
        // Extra server environment, e.g. --env LOG_LEVEL=warn (silences the request logs).
        env: { type: "string", multiple: true, default: [] },
        label: { type: "string", default: "" },
    },
});
const extraEnv = Object.fromEntries(args.env!.map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]));
const label = args.label ? `-${args.label}` : "";
const runtimes = args.runtimes!.split(",") as ("bun" | "node")[];
const rounds = Number(args.rounds);
const duration = Number(args.duration);
const warmup = Number(args.warmup);

interface Scenario {
    name: string;
    method: "GET" | "POST";
    path: string;
    auth?: boolean;
    body?: unknown;
    /** Accepted statuses (the contract check before measuring). */
    status: number[];
}

/** Built once the server is up: slugs and the token come from the API itself. */
function scenarios(slug: string, otherSlug: string): Scenario[] {
    return [
        { name: "tags", method: "GET", path: "/api/tags", status: [200] },
        { name: "article", method: "GET", path: `/api/articles/${slug}`, status: [200] },
        { name: "article-auth", method: "GET", path: `/api/articles/${slug}`, auth: true, status: [200] },
        { name: "list", method: "GET", path: "/api/articles?limit=20", status: [200] },
        { name: "list-auth", method: "GET", path: "/api/articles?limit=20", auth: true, status: [200] },
        { name: "list-tag", method: "GET", path: "/api/articles?tag=tag3&limit=20", status: [200] },
        { name: "feed", method: "GET", path: "/api/articles/feed?limit=20", auth: true, status: [200] },
        { name: "comments", method: "GET", path: `/api/articles/${slug}/comments`, status: [200] },
        { name: "profile", method: "GET", path: "/api/profiles/user1", auth: true, status: [200] },
        { name: "user", method: "GET", path: "/api/user", auth: true, status: [200] },
        {
            name: "comment-post",
            method: "POST",
            path: `/api/articles/${otherSlug}/comments`,
            auth: true,
            body: { comment: { body: "Load test comment." } },
            status: [200, 201],
        },
        {
            name: "invalid-post",
            method: "POST",
            path: "/api/articles",
            auth: true,
            body: { article: { title: "", description: 42 } },
            status: [400, 422],
        },
        { name: "unauthorized", method: "GET", path: "/api/user", status: [401] },
    ];
}

// Node runs a bundle of the app made with the plugin `sparkus build` uses (controllers
// found at build time), with sparkus left external: it resolves to the packages' dist/
// like an installed package, and profiles can tell framework and app files apart.
async function buildForNode(): Promise<string> {
    const outdir = join(root, "load/dist");
    rmSync(outdir, { recursive: true, force: true });
    const { sparkusPlugin } = await import(Bun.resolveSync("sparkus/build", root));
    const result = await Bun.build({
        entrypoints: [join(root, "src/main.ts"), join(root, "load/profile-entry.ts")],
        root,
        outdir,
        target: "node",
        format: "esm",
        external: ["sparkus", "@sparkus/*"],
        plugins: [sparkusPlugin({ onControllers() {} })],
    });
    if (!result.success) throw new Error(`Build failed:\n${result.logs.map(String).join("\n")}`);
    return outdir;
}

const layout = args.pin === "1" ? cpuLayout() : undefined;
let nextPort = 4600;

async function start(runtime: "bun" | "node", nodeDist: string, profileDir?: string, exitAfterMs?: number) {
    const port = nextPort++;
    const entry = runtime === "bun"
        ? join(root, profileDir ? "load/profile-entry.ts" : "src/main.ts")
        : join(nodeDist, profileDir ? "load/profile-entry.js" : "src/main.js");
    const cmd = [runtime === "bun" ? process.execPath : nodeBin];
    if (profileDir) cmd.push("--cpu-prof", `--cpu-prof-dir=${profileDir}`);
    cmd.push(entry);
    const proc = Bun.spawn(cmd, {
        cwd: root,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: "production",
            CONDUIT_SEED: args.seed,
            ...extraEnv,
            PROFILE_EXIT_MS: exitAfterMs ? String(exitAfterMs) : "",
        },
        stdout: "ignore",
        stderr: "pipe",
    });
    let stderr = "";
    (async () => {
        for await (const chunk of proc.stderr) stderr = (stderr + new TextDecoder().decode(chunk)).slice(-4000);
    })();
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error(`${runtime} server exited (${proc.exitCode}):\n${stderr}`);
        try {
            if ((await fetch(base + "/api/tags")).ok) {
                if (layout) setAffinity(proc.pid, layout.server);
                return { proc, base, stderr: () => stderr };
            }
        } catch {}
        await Bun.sleep(100);
    }
    proc.kill();
    throw new Error(`${runtime} server did not answer within 30 s:\n${stderr}`);
}

async function discover(base: string) {
    const login = await fetch(base + "/api/users/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: { email: "user0@conduit.test", password: "password" } }),
    });
    if (!login.ok) throw new Error(`Login failed: ${login.status} ${await login.text()} (is CONDUIT_SEED applied?)`);
    const token = ((await login.json()) as { user: { token: string } }).user.token;
    const list = (await (await fetch(base + "/api/articles?limit=2")).json()) as { articles: { slug: string }[] };
    if (list.articles.length < 2) throw new Error("The seed created fewer than 2 articles.");
    return { token, slug: list.articles[0]!.slug, otherSlug: list.articles[1]!.slug };
}

async function check(base: string, s: Scenario, token: string) {
    const res = await fetch(base + s.path, {
        method: s.method,
        headers: { ...(s.auth ? { authorization: `Token ${token}` } : {}), ...(s.body ? { "content-type": "application/json" } : {}) },
        body: s.body ? JSON.stringify(s.body) : undefined,
    });
    const text = await res.text();
    if (!s.status.includes(res.status)) throw new Error(`${s.name}: ${res.status} ${text.slice(0, 300)}`);
    if (/passwordHash|salt|"hash"/i.test(text)) throw new Error(`${s.name} leaks a password field: ${text.slice(0, 300)}`);
    return text.length;
}

async function load(base: string, s: Scenario, token: string, seconds: number) {
    const cmd = [nodeBin, autocannon, "-c", args.connections!, "-d", String(seconds), "-p", "1", "-w", "4", "-j"];
    if (s.auth) cmd.push("-H", `authorization=Token ${token}`);
    if (s.body) cmd.push("-m", s.method, "-H", "content-type=application/json", "-b", JSON.stringify(s.body));
    cmd.push(base + s.path);
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const r = JSON.parse(out);
    return { rps: r.requests.average as number, total: r.requests.total as number, p99: r.latency.p99 as number, bad: r.errors + r.timeouts };
}

// ---------------------------------------------------------------------------

await acquireMachineLock();
if (layout) setAffinity(process.pid, layout.loader);
const nodeDist = runtimes.includes("node") ? await buildForNode() : "";
const median = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length % 2 ? s[s.length >> 1]! : (s[(s.length >> 1) - 1]! + s[s.length >> 1]!) / 2;
};
const fr = (n: number) => Math.round(n).toLocaleString("fr-FR");

if (args.profile) {
    await profile();
    process.exit(0);
}

interface Row { runtime: string; scenario: string; rps: number; p99: number; cpu: number; perCpu: number; bytes: number }
const rows: Row[] = [];
for (let round = 1; round <= rounds; round++) {
    for (const runtime of round % 2 ? runtimes : [...runtimes].reverse()) {
        const server = await start(runtime, nodeDist);
        try {
            const { token, slug, otherSlug } = await discover(server.base);
            const all = scenarios(slug, otherSlug);
            const picked = args.scenarios ? all.filter((s) => args.scenarios!.split(",").includes(s.name)) : all;
            for (const s of picked) {
                const bytes = await check(server.base, s, token);
                if (warmup > 0) await load(server.base, s, token, warmup);
                const before = processStats(server.proc.pid);
                const m = await load(server.base, s, token, duration);
                const cpuSeconds = processStats(server.proc.pid).cpu - before.cpu;
                const row = {
                    runtime, scenario: s.name, rps: m.rps, p99: m.p99,
                    cpu: (cpuSeconds / duration) * 100, perCpu: m.total / cpuSeconds, bytes,
                };
                rows.push(row);
                console.log(
                    `[round ${round}] ${runtime.padEnd(5)} ${s.name.padEnd(13)} ${fr(m.rps).padStart(8)} req/s  p99 ${m.p99} ms  ` +
                        `CPU ${Math.round(row.cpu)} %  ${fr(row.perCpu)} req/s-CPU  ${bytes} B` + (m.bad ? `  !! ${m.bad} errors` : ""),
                );
            }
            const { peak } = processStats(server.proc.pid);
            console.log(`[round ${round}] ${runtime} peak RSS ${Math.round(peak / 1048576)} MiB`);
        } finally {
            server.proc.kill();
            await server.proc.exited;
        }
    }
}

const names = [...new Set(rows.map((r) => r.scenario))];
const lines = [
    `## Conduit, ${rounds} round(s) × ${duration} s, ${args.connections} connexions, seed ${args.seed}${args.env!.length ? `, ${args.env!.join(" ")}` : ""}, Node ${Bun.spawnSync([nodeBin, "-v"]).stdout.toString().trim()}, Bun ${Bun.version}`,
    "",
    `| Scénario | Octets | ${runtimes.map((r) => `${r} req/s | ${r} req/s-CPU | ${r} p99`).join(" | ")} |`,
    `|---|---:|${runtimes.map(() => "---:|---:|---:").join("|")}|`,
];
for (const name of names) {
    const cells = runtimes.map((runtime) => {
        const of = rows.filter((r) => r.runtime === runtime && r.scenario === name);
        return `${fr(median(of.map((r) => r.rps)))} | ${fr(median(of.map((r) => r.perCpu)))} | ${median(of.map((r) => r.p99))} ms`;
    });
    lines.push(`| ${name} | ${rows.find((r) => r.scenario === name)!.bytes} | ${cells.join(" | ")} |`);
}
console.log("\n" + lines.join("\n"));
mkdirSync(join(root, "load/results"), { recursive: true });
await Bun.write(join(root, `load/results/${new Date().toISOString().replace(/[:.]/g, "-")}${label}.md`), lines.join("\n") + "\n");

// ---------------------------------------------------------------------------
// Profiles: one server per (runtime, scenario), loaded for `duration` seconds,
// then made to exit so the runtime writes its .cpuprofile.

async function profile() {
    const out: string[] = ["## Profil CPU du serveur (temps propre, hors idle)", ""];
    const firstServer = await start(runtimes[0]!, nodeDist);
    const { slug, otherSlug } = await discover(firstServer.base);
    firstServer.proc.kill();
    await firstServer.proc.exited;
    const all = scenarios(slug, otherSlug);
    const picked = args.scenarios ? all.filter((s) => args.scenarios!.split(",").includes(s.name)) : all;
    for (const runtime of runtimes) {
        for (const s of picked) {
            const dir = join(root, "load/profiles", `${runtime}-${s.name}`);
            rmSync(dir, { recursive: true, force: true });
            mkdirSync(dir, { recursive: true });
            const server = await start(runtime, nodeDist, dir, (warmup + duration + 3) * 1000);
            const { token } = await discover(server.base);
            await check(server.base, s, token);
            if (warmup > 0) await load(server.base, s, token, warmup);
            await load(server.base, s, token, duration);
            await server.proc.exited;
            const file = readdirSync(dir).find((f) => f.endsWith(".cpuprofile"));
            if (!file) throw new Error(`No profile written in ${dir}:\n${server.stderr()}`);
            const split = summarize(JSON.parse(readFileSync(join(dir, file), "utf8")));
            out.push(`### ${runtime} · ${s.name}`, "", split, "");
            console.log(`${runtime} ${s.name}\n${split}\n`);
        }
    }
    await Bun.write(join(root, `load/profiles/summary${label}.md`), out.join("\n") + "\n");
}

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }

function category(url: string): string {
    const u = url.replaceAll("\\", "/");
    if (u.includes("/packages/core/")) return "sparkus core";
    if (u.includes("/packages/engine-")) return "sparkus engine";
    if (u.includes("/examples/conduit/")) return "app";
    if (u === "") return "runtime (natif, GC)";
    return "runtime (JS)";
}

function summarize(p: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }): string {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const self = new Map<number, number>();
    for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i]!, (self.get(p.samples[i]!) ?? 0) + (p.timeDeltas[i] ?? 0));
    const cats = new Map<string, number>();
    const fns = new Map<string, number>();
    let total = 0;
    for (const [id, t] of self) {
        const node = byId.get(id)!;
        const name = node.callFrame.functionName;
        if (name === "(idle)") continue;
        total += t;
        const cat = category(node.callFrame.url);
        cats.set(cat, (cats.get(cat) ?? 0) + t);
        const file = node.callFrame.url.replaceAll("\\", "/").split("/").slice(-2).join("/");
        const key = `${name || "(anonyme)"} ${file ? `${file}:${node.callFrame.lineNumber + 1}` : ""}`.trim();
        fns.set(key, (fns.get(key) ?? 0) + t);
    }
    const pct = (t: number) => `${((t / total) * 100).toFixed(1)} %`;
    const catLine = [...cats].sort((a, b) => b[1] - a[1]).map(([c, t]) => `${c} ${pct(t)}`).join(" · ");
    const top = [...fns].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([f, t]) => `| ${pct(t)} | \`${f}\` |`);
    return [catLine, "", "| Self | Fonction |", "|---:|---|", ...top].join("\n");
}

