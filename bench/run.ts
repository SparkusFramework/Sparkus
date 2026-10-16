/**
 * Benchmark runner (Bun). For each run, targets are shuffled; each target is
 * started in its own process, checked against the response contract, warmed
 * up, then measured with autocannon running in a separate Node process.
 *
 *   bun run.ts [--targets a,b] [--scenarios a,b] [--runs 3] [--duration 10]
 *              [--warmup 3] [--connections 100] [--workers 0]
 *
 * NODE_BIN selects the Node binary used for Node targets and for autocannon.
 */
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invalidBody, scenarios as allScenarios, type Scenario } from "./scenarios.ts";
import { targets as allTargets, type Target } from "./targets.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);

const pick = <T extends { name: string }>(all: T[], key: string): T[] => {
    const wanted = args.get(key)?.split(",");
    if (!wanted) return all;
    const unknown = wanted.filter((w) => !all.some((x) => x.name === w));
    if (unknown.length > 0) throw new Error(`Unknown ${key}: ${unknown.join(", ")}`);
    return all.filter((x) => wanted.includes(x.name));
};

const config = {
    targets: pick(allTargets, "targets"),
    scenarios: pick(allScenarios, "scenarios"),
    runs: Number(args.get("runs") ?? 3),
    duration: Number(args.get("duration") ?? 10),
    warmup: Number(args.get("warmup") ?? 3),
    connections: Number(args.get("connections") ?? 100),
    workers: Number(args.get("workers") ?? 0),
    nodeBin: process.env.NODE_BIN ?? "node",
};

/**
 * One benchmark at a time on this machine, across every checkout and worktree:
 * two benches in parallel would measure each other. The lock holds the PID of
 * its owner; a lock left by a dead process is taken over.
 */
async function acquireMachineLock(): Promise<void> {
    const path = join(tmpdir(), "sparkus-bench.lock");
    let announced = false;
    for (;;) {
        try {
            const fd = openSync(path, "wx");
            writeFileSync(fd, String(process.pid));
            closeSync(fd);
            process.on("exit", () => {
                try {
                    if (readFileSync(path, "utf8") === String(process.pid)) rmSync(path);
                } catch {}
            });
            return;
        } catch (error: any) {
            if (error.code !== "EEXIST") throw error;
        }
        let owner = NaN;
        try {
            owner = Number(readFileSync(path, "utf8"));
        } catch {}
        let alive = false;
        if (Number.isInteger(owner) && owner > 0) {
            try {
                process.kill(owner, 0);
                alive = true;
            } catch {}
        }
        if (!alive) {
            rmSync(path, { force: true });
            continue;
        }
        if (!announced) {
            console.log(`Another benchmark (PID ${owner}) is running; waiting for it to finish...`);
            announced = true;
        }
        await Bun.sleep(2_000);
    }
}

await acquireMachineLock();

const benchDir = import.meta.dir;
const autocannon = Bun.resolveSync("autocannon/autocannon.js", benchDir);
let nextPort = 4100;

interface Sample {
    run: number;
    target: string;
    runtime: string;
    scenario: string;
    rps: number;
    p50: number;
    p99: number;
    errors: number;
    non2xx: number;
    /** Server CPU during the measured window, in % of one core (can exceed 100 with threads). */
    cpu: number;
    /** Requests served per second of server CPU: efficiency, independent of the machine's ceiling. */
    reqPerCpuSec: number;
    /** Server resident memory at the end of the scenario, in bytes. */
    rss: number;
}

const samples: Sample[] = [];
const peakMemory = new Map<string, number[]>();

// Child processes (server, autocannon) alive right now, killed if the run is interrupted.
const children = new Set<Bun.Subprocess>();
const track = <P extends Bun.Subprocess>(proc: P): P => {
    children.add(proc);
    proc.exited.then(() => children.delete(proc));
    return proc;
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
        for (const child of children) child.kill();
        process.exit(130);
    });
}

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
}

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

async function startTarget(target: Target, port: number) {
    const bin = target.runtime === "bun" ? process.execPath : config.nodeBin;
    const proc = track(Bun.spawn([bin, join(benchDir, target.entry)], {
        cwd: benchDir,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
        stdout: "ignore",
        stderr: "pipe",
    }));

    let stderr = "";
    (async () => {
        for await (const chunk of proc.stderr) stderr = (stderr + new TextDecoder().decode(chunk)).slice(-4000);
    })();

    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error(`${target.name} exited (${proc.exitCode}):\n${stderr}`);
        try {
            if ((await fetch(base + "/")).ok) return { proc, base };
        } catch {}
        await Bun.sleep(100);
    }
    proc.kill();
    throw new Error(`${target.name} did not answer on ${base} within 30 s:\n${stderr}`);
}

async function checkContract(target: Target, base: string, scenarios: Scenario[]) {
    for (const s of scenarios) {
        const res = await fetch(base + s.path, {
            method: s.method,
            headers: s.body ? { "content-type": "application/json" } : {},
            body: s.body ? JSON.stringify(s.body) : undefined,
        });
        const text = await res.text();
        const type = res.headers.get("content-type") ?? "";
        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {}
        if (res.status !== s.expect.status || !Bun.deepEquals(body, s.expect.body) || !type.includes("application/json")) {
            throw new Error(
                `${target.name} breaks the contract of "${s.name}": got ${res.status} ${type} ${text}, ` +
                    `expected ${s.expect.status} ${JSON.stringify(s.expect.body)}`,
            );
        }
    }

    const res = await fetch(base + invalidBody.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(invalidBody.body),
    });
    if (!invalidBody.statuses.includes(res.status)) {
        throw new Error(`${target.name} accepted an invalid body (status ${res.status}).`);
    }
}

async function load(base: string, s: Scenario, seconds: number) {
    const cmd = [
        config.nodeBin,
        autocannon,
        "-c", String(config.connections),
        "-d", String(seconds),
        "-p", "1",
        "-j",
    ];
    if (config.workers > 0) cmd.push("-w", String(config.workers));
    if (s.body) cmd.push("-m", s.method, "-H", "content-type=application/json", "-b", JSON.stringify(s.body));
    cmd.push(base + s.path);

    const proc = track(Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" }));
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const r = JSON.parse(out);
    return {
        rps: r.requests.average,
        total: r.requests.total,
        p50: r.latency.p50,
        p99: r.latency.p99,
        errors: r.errors + r.timeouts,
        non2xx: r.non2xx,
    };
}

/** CPU seconds consumed so far, current and peak resident memory of a process. */
function processStats(pid: number): { cpu: number; rss: number; peak: number } {
    if (process.platform === "win32") {
        const script = `$p = Get-Process -Id ${pid}; "$($p.TotalProcessorTime.TotalSeconds);$($p.WorkingSet64);$($p.PeakWorkingSet64)"`;
        const out = Bun.spawnSync(["powershell", "-NoProfile", "-Command", script]).stdout.toString().trim();
        const [cpu, rss, peak] = out.replace(/,/g, ".").split(";").map(Number);
        return { cpu: cpu!, rss: rss!, peak: peak! };
    }
    // Linux: utime + stime are fields 14 and 15 of /proc/<pid>/stat, in clock ticks (100 Hz).
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const kb = (name: string) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(status)![1]) * 1024;
    return { cpu: (Number(fields[11]) + Number(fields[12])) / 100, rss: kb("VmRSS"), peak: kb("VmHWM") };
}

const nodeVersion = Bun.spawnSync([config.nodeBin, "-v"]).stdout.toString().trim();
const runtimes = { bun: Bun.version, node: nodeVersion };
const totalSeconds =
    config.runs * config.targets.length * config.scenarios.length * (config.warmup + config.duration + 1);
console.log(
    `Sparkus bench: ${config.targets.length} targets x ${config.scenarios.length} scenarios x ${config.runs} runs, ` +
        `Bun ${runtimes.bun}, Node ${runtimes.node}, ~${Math.ceil(totalSeconds / 60)} min`,
);

for (let run = 1; run <= config.runs; run++) {
    for (const target of shuffle(config.targets)) {
        const port = nextPort++;
        const { proc, base } = await startTarget(target, port);
        try {
            await checkContract(target, base, config.scenarios);
            for (const s of config.scenarios) {
                if (config.warmup > 0) await load(base, s, config.warmup);
                const before = processStats(proc.pid);
                const { total, ...m } = await load(base, s, config.duration);
                const after = processStats(proc.pid);
                const cpuSeconds = after.cpu - before.cpu;
                const sample: Sample = {
                    run,
                    target: target.name,
                    runtime: target.runtime,
                    scenario: s.name,
                    ...m,
                    cpu: (cpuSeconds / config.duration) * 100,
                    reqPerCpuSec: cpuSeconds > 0 ? total / cpuSeconds : 0,
                    rss: after.rss,
                };
                samples.push(sample);
                const flag = m.errors + m.non2xx > 0 ? `  !! ${m.errors} errors, ${m.non2xx} non-2xx` : "";
                console.log(
                    `[run ${run}] ${target.name.padEnd(13)} ${s.name.padEnd(14)} ${Math.round(m.rps).toString().padStart(7)} req/s  ` +
                        `p50 ${m.p50} ms  p99 ${m.p99} ms  CPU ${Math.round(sample.cpu)} %  ` +
                        `${Math.round(sample.reqPerCpuSec)} req/s-CPU  RSS ${Math.round(sample.rss / 2 ** 20)} Mo${flag}`,
                );
            }
            const { peak } = processStats(proc.pid);
            peakMemory.set(target.name, [...(peakMemory.get(target.name) ?? []), peak]);
        } finally {
            proc.kill();
            await proc.exited;
        }
    }
}

// Summary: one table per scenario, ranked, with the runtime ceiling as 100 %.
const lines: string[] = [];
lines.push(`# Résultats du bench`, "");
lines.push(
    `${new Date().toISOString()} · ${process.platform} · Bun ${runtimes.bun} · Node ${runtimes.node} · ` +
        `${config.runs} runs (médiane) · ${config.duration} s · ${config.connections} connexions`,
    "",
);

for (const s of config.scenarios) {
    lines.push(`## ${s.name} — ${s.description}`, "");
    lines.push(
        "| Cible | Runtime | req/s | % du plafond | p50 (ms) | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    );
    const rows = config.targets
        .map((target) => {
            const mine = samples.filter((x) => x.target === target.name && x.scenario === s.name);
            const med = (key: "rps" | "p50" | "p99" | "cpu" | "reqPerCpuSec" | "rss") => median(mine.map((x) => x[key]));
            return { target, rps: med("rps"), p50: med("p50"), p99: med("p99"), cpu: med("cpu"), eff: med("reqPerCpuSec"), rss: med("rss") };
        })
        .sort((a, b) => b.rps - a.rps);
    const fr = (n: number) => Math.round(n).toLocaleString("fr-FR");
    for (const row of rows) {
        const ceiling = rows.find((r) => r.target.runtime === row.target.runtime && r.target.role === "ceiling");
        const pct = ceiling ? `${Math.round((row.rps / ceiling.rps) * 100)} %` : "–";
        const name = row.target.role === "sparkus" ? `**${row.target.name}**` : row.target.name;
        lines.push(
            `| ${name} | ${row.target.runtime} | ${fr(row.rps)} | ${pct} | ${row.p50} | ${row.p99} | ` +
                `${Math.round(row.cpu)} % | ${fr(row.eff)} | ${Math.round(row.rss / 2 ** 20)} |`,
        );
    }
    lines.push("");
}

lines.push("## Mémoire (pic du process sur toute la session)", "", "| Cible | RSS pic (Mo) |", "|---|---:|");
for (const target of config.targets) {
    const values = peakMemory.get(target.name) ?? [];
    if (values.length) lines.push(`| ${target.name} | ${Math.round(median(values) / 1024 / 1024)} |`);
}

const summary = lines.join("\n") + "\n";
const resultsDir = join(benchDir, "results");
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(resultsDir, `${stamp}.json`), JSON.stringify({ config: { ...config, runtimes }, samples, peakMemory: Object.fromEntries(peakMemory) }, null, 2));
writeFileSync(join(resultsDir, "latest.md"), summary);
console.log("\n" + summary);
