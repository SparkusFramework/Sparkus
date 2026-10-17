/**
 * Benchmark runner (Bun). A session is a series of rounds; each round measures
 * every (target, scenario) once, in a balanced order (rotated, reversed every
 * other round) so that slow drift hits every target alike. Each target starts
 * in its own process on a fresh port, is checked against the response contract,
 * warmed up, then measured with autocannon running in a separate Node process.
 * Comparisons are made round by round (paired ratios), never across sessions.
 *
 *   bun run.ts [--targets a,b] [--scenarios a,b] [--rounds 3] [--duration 10]
 *              [--warmup 3] [--cooldown 0] [--connections 100] [--workers 4]
 *              [--pin 1] [--cores 0-7] [--baseline <git-ref>] [--label name]
 *
 * --pin 1 (default) gives each server a physical core of its own and keeps
 * autocannon on other cores: an SMT sibling shared with a busy thread costs a
 * single-threaded server 17 to 51 % of its throughput (README).
 *
 * --baseline builds Sparkus at <git-ref> in a temporary clone and adds a
 * "<target>@<ref>" twin for every selected Sparkus target: an A/B session.
 * NODE_BIN selects the Node binary used for Node targets and for autocannon.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { extraScenarios, invalidBody, scenarios as allScenarios, type Scenario } from "./scenarios.ts";
import {
    acquireMachineLock,
    cpuLayout,
    exitedCpuSeconds,
    logicalCpus,
    processStats,
    setAffinity,
    SystemSampler,
} from "./system.ts";
import { extraTargets, targets as allTargets, type Target } from "./targets.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);

const pick = <T extends { name: string }>(all: T[], key: string): T[] => {
    const wanted = args.get(key)?.split(",");
    if (!wanted) return all;
    const unknown = wanted.filter((w) => !all.some((x) => x.name === w));
    if (unknown.length > 0) throw new Error(`Unknown ${key}: ${unknown.join(", ")}`);
    return all.filter((x) => wanted.includes(x.name));
};

const baselineRef = args.get("baseline");

/** "0-3,8" -> [0, 1, 2, 3, 8]. */
function parseCpuList(list: string | undefined): number[] | undefined {
    if (!list) return undefined;
    return list.split(",").flatMap((part) => {
        const [a, b] = part.split("-").map(Number);
        return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, i) => a! + i);
    });
}
const config = {
    // Extra targets and scenarios run only when named.
    targets: args.has("targets") ? pick([...allTargets, ...extraTargets], "targets") : allTargets,
    scenarios: args.has("scenarios") ? pick([...allScenarios, ...extraScenarios], "scenarios") : allScenarios,
    rounds: Number(args.get("rounds") ?? args.get("runs") ?? (baselineRef ? 5 : 3)),
    duration: Number(args.get("duration") ?? 10),
    warmup: Number(args.get("warmup") ?? 3),
    cooldown: Number(args.get("cooldown") ?? 0),
    connections: Number(args.get("connections") ?? 100),
    workers: Number(args.get("workers") ?? 4),
    pin: (args.get("pin") ?? "1") !== "0" && logicalCpus >= 8,
    /** Logical CPUs this session may use (e.g. "0-7"), for running two sessions side by side. */
    cores: parseCpuList(args.get("cores")),
    baseline: baselineRef,
    nodeBin: process.env.NODE_BIN ?? "node",
    /** Also writes results/<label>.md, so chained sessions keep their summaries. */
    label: args.get("label"),
};

/** A sample is "noisy" when other processes used more than this much CPU (% of one core) during it. */
const NOISY_OTHER_CPU = 150;
/** Rounds needed before a paired comparison can be called proved (sign test, one-sided p = 1/32). */
const PROOF_ROUNDS = 5;

const benchDir = import.meta.dir;

/** A target to run, possibly from another checkout (A/B baseline). */
interface Run extends Target {
    /** Directory the entry is relative to, and the process cwd. */
    dir: string;
    /** For a baseline twin, the name of the working tree target it is compared with. */
    twinOf?: string;
}

const git = (cwd: string, ...cmd: string[]) => {
    const out = Bun.spawnSync(["git", ...cmd], { cwd, stderr: "pipe" });
    if (out.exitCode !== 0) throw new Error(`git ${cmd.join(" ")} failed: ${out.stderr.toString().trim()}`);
    return out.stdout.toString().trim();
};

const step = (cwd: string, cmd: string[]) => {
    const out = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
    if (out.exitCode !== 0) {
        throw new Error(`${cmd.join(" ")} failed in ${cwd}:\n${out.stdout.toString()}${out.stderr.toString()}`);
    }
};

/**
 * Clones the repository at `ref` into the OS temp dir and builds what the
 * Sparkus targets need. Cached by commit: a second session on the same ref
 * reuses the build. Returns the baseline's bench directory.
 */
function prepareBaseline(ref: string): string {
    const repo = git(benchDir, "rev-parse", "--show-toplevel");
    const sha = git(repo, "rev-parse", "--verify", `${ref}^{commit}`);
    const dir = join(tmpdir(), "sparkus-bench-baseline", sha.slice(0, 12));
    const bench = join(dir, "bench");
    const done = join(dir, ".sparkus-bench-built");
    if (existsSync(done)) {
        console.log(`Baseline ${ref} (${sha.slice(0, 12)}): reusing ${dir}`);
        return bench;
    }
    console.log(`Baseline ${ref} (${sha.slice(0, 12)}): cloning and building in ${dir} ...`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    git(repo, "clone", "--quiet", "--shared", "--no-checkout", repo, dir);
    git(dir, "checkout", "--quiet", "--detach", sha);
    if (!existsSync(join(bench, "targets/sparkus/server.ts"))) {
        throw new Error(`${ref} has no bench/targets/sparkus/server.ts: pick a baseline from v1 onwards.`);
    }
    const tsc = join(dir, "node_modules/typescript/bin/tsc");
    step(dir, [process.execPath, "install"]);
    // Since the bundled build, packages' dist comes from scripts/build.ts, not from tsc.
    if (existsSync(join(dir, "scripts/build.ts"))) step(dir, [process.execPath, join(dir, "scripts/build.ts")]);
    else step(dir, [process.execPath, tsc, "-b"]);
    step(bench, [process.execPath, tsc, "-p", "targets/sparkus/tsconfig.json"]);
    writeFileSync(done, sha);
    return bench;
}

/**
 * A Sparkus target newer than the baseline (e.g. sparkus-pipeline) is the same app on
 * both sides: its sources are copied from the working tree into the baseline and built there.
 */
function ensureBaselineTarget(baseDir: string, target: Target): void {
    if (existsSync(join(baseDir, target.entry))) return;
    const folder = target.entry.split("/").slice(0, 2).join("/");
    cpSync(join(benchDir, folder), join(baseDir, folder), {
        recursive: true,
        filter: (source) => !source.includes("dist"),
    });
    if (existsSync(join(baseDir, folder, "tsconfig.json"))) {
        const tsc = join(baseDir, "../node_modules/typescript/bin/tsc");
        step(baseDir, [process.execPath, tsc, "-p", `${folder}/tsconfig.json`]);
    }
}

const runs: Run[] = config.targets.map((t) => ({ ...t, dir: benchDir }));
if (config.baseline) {
    const baseDir = prepareBaseline(config.baseline);
    const sparkus = runs.filter((t) => t.role === "sparkus");
    if (sparkus.length === 0) throw new Error("--baseline needs at least one Sparkus target (sparkus-bun, sparkus-node).");
    for (const t of sparkus) ensureBaselineTarget(baseDir, t);
    for (const t of sparkus) runs.push({ ...t, name: `${t.name}@${config.baseline}`, dir: baseDir, twinOf: t.name });
}

await acquireMachineLock();

const autocannon = Bun.resolveSync("autocannon/autocannon.js", benchDir);
// Two sessions on disjoint --cores must not share ports.
let nextPort = 4100 + (config.cores?.[0] ?? 0) * 100;

interface Sample {
    round: number;
    /** Seconds since the session started. */
    at: number;
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
    /** Load generator CPU, in % of one core. */
    loaderCpu: number;
    /** Effective CPU clock in % of nominal, averaged over the window (NaN if unknown). */
    clock: number;
    /** CPU used by everything else on the machine during the window, in % of one core. */
    otherCpu: number;
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
const sampler = new SystemSampler().start();
// Pinned: this process (hence autocannon, which inherits its affinity) runs on
// the loader CPUs, each server is moved to its own physical core once started.
const layout = config.pin ? cpuLayout(config.cores) : undefined;
if (layout) setAffinity(process.pid, layout.loader);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
        sampler.stop();
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

/**
 * Round r runs the base order rotated by floor(r / 2), reversed on odd rounds.
 * With two targets this is A B, B A, B A, A B: each one goes first and last
 * equally often, so a drift during the session cancels out in paired ratios.
 */
function roundOrder<T>(base: T[], round: number): T[] {
    const shift = Math.floor(round / 2) % base.length;
    const rotated = [...base.slice(shift), ...base.slice(0, shift)];
    return round % 2 ? rotated.reverse() : rotated;
}

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

async function startTarget(target: Run, port: number) {
    const bin = target.runtime === "bun" ? process.execPath : config.nodeBin;
    const entry = isAbsolute(target.entry) ? target.entry : join(target.dir, target.entry);
    const proc = track(Bun.spawn([bin, entry], {
        cwd: target.dir,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production", ...target.env },
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
            if ((await fetch(base + "/")).ok) {
                if (layout) setAffinity(proc.pid, layout.server);
                return { proc, base };
            }
        } catch {}
        await Bun.sleep(100);
    }
    proc.kill();
    throw new Error(`${target.name} did not answer on ${base} within 30 s:\n${stderr}`);
}

async function checkContract(target: Run, base: string, scenarios: Scenario[]) {
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
        const statusOk = (s.expect.statuses ?? [s.expect.status]).includes(res.status);
        const bodyOk = s.expect.body === undefined || Bun.deepEquals(body, s.expect.body);
        if (!statusOk || !bodyOk || !type.includes(s.expect.contentType ?? "application/json")) {
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

    const from = Date.now();
    const proc = track(Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" }));
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const to = Date.now();
    const r = JSON.parse(out);
    return {
        rps: r.requests.average,
        total: r.requests.total,
        p50: r.latency.p50,
        p99: r.latency.p99,
        errors: r.errors + r.timeouts,
        non2xx: r.non2xx,
        from,
        to,
        loaderCpu: (exitedCpuSeconds(proc) / ((to - from) / 1000)) * 100,
    };
}

const nodeVersion = Bun.spawnSync([config.nodeBin, "-v"]).stdout.toString().trim();
const runtimes = { bun: Bun.version, node: nodeVersion };
const perMeasure = config.warmup + config.duration + config.cooldown + 2;
const totalSeconds = config.rounds * runs.length * config.scenarios.length * perMeasure;
console.log(
    `Sparkus bench: ${runs.length} targets x ${config.scenarios.length} scenarios x ${config.rounds} rounds, ` +
        `Bun ${runtimes.bun}, Node ${runtimes.node}, ~${Math.ceil(totalSeconds / 60)} min`,
);
if (config.baseline && config.rounds < PROOF_ROUNDS) {
    console.log(`!! A/B with ${config.rounds} rounds: a gain cannot be proved below ${PROOF_ROUNDS} rounds.`);
}

const started = Date.now();
const baseOrder = shuffle(runs);
for (let round = 1; round <= config.rounds; round++) {
    for (const target of roundOrder(baseOrder, round - 1)) {
        const port = nextPort++;
        const { proc, base } = await startTarget(target, port);
        try {
            await checkContract(target, base, config.scenarios);
            for (const s of config.scenarios) {
                if (config.cooldown > 0) await Bun.sleep(config.cooldown * 1000);
                if (config.warmup > 0) await load(base, s, config.warmup);
                const before = processStats(proc.pid);
                const { total, from, to, loaderCpu, ...m } = await load(base, s, config.duration);
                const after = processStats(proc.pid);
                const cpuSeconds = after.cpu - before.cpu;
                const cpu = (cpuSeconds / config.duration) * 100;
                // Skip the first second: autocannon is still starting.
                const machine = sampler.window(from + 1000, to);
                const sample: Sample = {
                    round,
                    at: Math.round((from - started) / 1000),
                    target: target.name,
                    runtime: target.runtime,
                    scenario: s.name,
                    ...m,
                    cpu,
                    reqPerCpuSec: cpuSeconds > 0 ? total / cpuSeconds : 0,
                    rss: after.rss,
                    loaderCpu,
                    clock: machine.perf,
                    otherCpu: machine.busy - cpu - loaderCpu,
                };
                samples.push(sample);
                const flags = [
                    m.errors + m.non2xx > 0 ? `!! ${m.errors} errors, ${m.non2xx} non-2xx` : "",
                    sample.otherCpu > NOISY_OTHER_CPU ? `!! noisy: other processes used ${Math.round(sample.otherCpu)} % CPU` : "",
                ].filter(Boolean);
                console.log(
                    `[round ${round}] ${target.name.padEnd(18)} ${s.name.padEnd(14)} ${Math.round(m.rps).toString().padStart(7)} req/s  ` +
                        `p99 ${m.p99} ms  CPU ${Math.round(cpu)} %  ${Math.round(sample.reqPerCpuSec)} req/s-CPU  ` +
                        `loader ${Math.round(loaderCpu)} %  clock ${Math.round(sample.clock)} %  other ${Math.round(sample.otherCpu)} %` +
                        (flags.length ? "  " + flags.join("  ") : ""),
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
sampler.stop();

// ---------------------------------------------------------------------------
// Summary. Every comparison is a ratio computed inside each round, then
// summarized (median, min, max): the drift between rounds cancels out.

const fr = (n: number) => Math.round(n).toLocaleString("fr-FR");
const pct = (n: number) => `${Math.round(n * 100)} %`;
const signed = (ratio: number) => `${ratio >= 1 ? "+" : "−"}${Math.abs((ratio - 1) * 100).toFixed(1)} %`;

const of = (target: string, scenario: string) =>
    samples.filter((x) => x.target === target && x.scenario === scenario).sort((a, b) => a.round - b.round);

/** Per-round ratios a / b on req/s, for the rounds where both were measured. */
function pairedRatios(a: string, b: string, scenario: string): number[] {
    const bs = new Map(of(b, scenario).map((x) => [x.round, x.rps]));
    return of(a, scenario).flatMap((x) => (bs.has(x.round) ? [x.rps / bs.get(x.round)!] : []));
}

type Verdict = "prouvé" | "≈" | "indicatif";
/** "prouvé": every round agrees on the side of 1 with enough rounds; "indicatif": they agree, too few rounds. */
function verdict(ratios: number[]): Verdict {
    const above = ratios.every((r) => r > 1);
    const below = ratios.every((r) => r < 1);
    if (!above && !below) return "≈";
    return ratios.length >= PROOF_ROUNDS ? "prouvé" : "indicatif";
}

const range = (values: number[], format: (n: number) => string) =>
    values.length ? `${format(Math.min(...values))} – ${format(Math.max(...values))}` : "–";

const lines: string[] = [];
lines.push(`# Résultats du bench`, "");
lines.push(
    `${new Date().toISOString()} · ${process.platform} · ${logicalCpus} CPU logiques · Bun ${runtimes.bun} · Node ${runtimes.node} · ` +
        `${config.rounds} rounds · ${config.duration} s (+${config.warmup} s de warm-up, ${config.cooldown} s de pause) · ` +
        `${config.connections} connexions · autocannon ${config.workers || 1} thread(s)` +
        (layout ? ` · serveur épinglé sur les CPU ${layout.server.join(",")}, autocannon sur ${layout.loader.join(",")}` : " · sans épinglage") +
        (config.baseline ? ` · baseline \`${config.baseline}\`` : ""),
    "",
);
lines.push(
    "Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. " +
        "Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. " +
        `**≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. ` +
        `*indicatif* : tous les rounds sont d'accord, mais moins de ${PROOF_ROUNDS} rounds.`,
    "",
);

for (const s of config.scenarios) {
    lines.push(`## ${s.name} — ${s.description}`, "");
    lines.push(
        "| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    );
    const rows = runs
        .map((target) => {
            const mine = of(target.name, s.name);
            const med = (key: "rps" | "p99" | "cpu" | "reqPerCpuSec" | "rss") => median(mine.map((x) => x[key]));
            const rps = mine.map((x) => x.rps);
            return {
                target,
                rps,
                medRps: med("rps"),
                p99: med("p99"),
                cpu: med("cpu"),
                eff: med("reqPerCpuSec"),
                rss: med("rss"),
            };
        })
        .filter((row) => row.rps.length > 0)
        .sort((a, b) => b.medRps - a.medRps);
    rows.forEach((row, i) => {
        const ceiling = runs.find((t) => t.runtime === row.target.runtime && t.role === "ceiling");
        let ofCeiling = "–";
        if (ceiling && ceiling.name !== row.target.name) {
            const ratios = pairedRatios(row.target.name, ceiling.name, s.name);
            if (ratios.length) ofCeiling = `${pct(median(ratios))} (${range(ratios, pct)})`;
        } else if (ceiling) ofCeiling = "100 %";
        const next = rows[i + 1];
        let vsNext = "";
        if (next) {
            const ratios = pairedRatios(row.target.name, next.target.name, s.name);
            const v = verdict(ratios);
            vsNext = `${signed(median(ratios))}${v === "prouvé" ? "" : ` ${v}`}`;
        }
        const name = row.target.role === "sparkus" ? `**${row.target.name}**` : row.target.name;
        const spread = (Math.max(...row.rps) - Math.min(...row.rps)) / row.medRps;
        lines.push(
            `| ${name} | ${row.target.runtime} | ${fr(row.medRps)} | ${range(row.rps, fr)} | ${pct(spread)} | ${ofCeiling} | ${vsNext} | ` +
                `${row.p99} | ${Math.round(row.cpu)} % | ${fr(row.eff)} | ${Math.round(row.rss / 2 ** 20)} |`,
        );
    });
    lines.push("");
}

const twins = runs.filter((t) => t.twinOf);
if (twins.length) {
    lines.push(`## A/B : arbre de travail vs \`${config.baseline}\``, "");
    lines.push(
        `Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les ${PROOF_ROUNDS}+ rounds sont tous du même côté ` +
            "(test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).",
        "",
        "| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |",
        "|---|---|---:|---|---:|---|",
    );
    for (const twin of twins) {
        for (const s of config.scenarios) {
            const ratios = pairedRatios(twin.twinOf!, twin.name, s.name);
            const effBase = new Map(of(twin.name, s.name).map((x) => [x.round, x.reqPerCpuSec]));
            const eff = of(twin.twinOf!, s.name).flatMap((x) =>
                effBase.has(x.round) ? [x.reqPerCpuSec / effBase.get(x.round)!] : [],
            );
            const show = (r: number[]) => `${signed(median(r))} (${range(r, signed)})`;
            lines.push(
                `| ${twin.twinOf} | ${s.name} | ${show(ratios)} | ${verdict(ratios)} | ${show(eff)} | ${verdict(eff)} |`,
            );
        }
    }
    lines.push("");
}

lines.push("## Mémoire (pic du process, médiane des rounds)", "", "| Cible | RSS pic (Mo) |", "|---|---:|");
for (const target of runs) {
    const values = peakMemory.get(target.name) ?? [];
    if (values.length) lines.push(`| ${target.name} | ${Math.round(median(values) / 1024 / 1024)} |`);
}
lines.push("");

const clocks = samples.map((x) => x.clock).filter(Number.isFinite);
const others = samples.map((x) => x.otherCpu).filter(Number.isFinite);
const noisy = samples.filter((x) => x.otherCpu > NOISY_OTHER_CPU);
lines.push("## Machine pendant la session", "");
if (clocks.length) lines.push(`- Horloge effective : ${range(clocks, (n) => `${Math.round(n)} %`)} de la fréquence nominale.`);
if (others.length) {
    lines.push(
        `- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane ${Math.round(median(others))} %, ` +
            `max ${Math.round(Math.max(...others))} % d'un cœur.`,
    );
}
lines.push(
    `- Autocannon : max ${Math.round(Math.max(...samples.map((x) => x.loaderCpu)))} % d'un cœur ` +
        `(${config.workers || 1} thread(s) : s'il approche ${(config.workers || 1) * 100} %, c'est lui le goulot).`,
);
if (noisy.length) {
    lines.push(
        `- **${noisy.length} mesure(s) bruitée(s)** (autres process > ${NOISY_OTHER_CPU} % d'un cœur) : ` +
            noisy.map((x) => `${x.target}/${x.scenario} round ${x.round} (${Math.round(x.otherCpu)} %)`).join(", ") +
            ". Relancer sur une machine calme si elles comptent.",
    );
}

const summary = lines.join("\n") + "\n";
const resultsDir = join(benchDir, "results");
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(
    join(resultsDir, `${stamp}${config.label ? "-" + config.label : ""}.json`),
    JSON.stringify(
        { config: { ...config, targets: runs, runtimes }, samples, peakMemory: Object.fromEntries(peakMemory) },
        null,
        2,
    ),
);
writeFileSync(join(resultsDir, "latest.md"), summary);
if (config.label) writeFileSync(join(resultsDir, `${config.label}.md`), summary);
console.log("\n" + summary);
process.exit(0);
