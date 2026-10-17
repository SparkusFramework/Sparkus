/**
 * Machine-level helpers for the bench: the machine-wide lock, per-process CPU,
 * and a background sampler that records what the rest of the machine was doing
 * during each measurement (effective CPU frequency, total load).
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";

export const logicalCpus = availableParallelism();

const isAlive = (pid: number) => {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

interface ProcessInfo {
    ppid: number;
    /** CPU seconds used so far. */
    cpu: number;
    cmd: string;
}

/** Every process on the machine (one PowerShell call on Windows, /proc on Linux). */
function processTable(): Map<number, ProcessInfo> {
    const table = new Map<number, ProcessInfo>();
    if (process.platform === "win32") {
        const script =
            "Get-CimInstance Win32_Process | ForEach-Object { " +
            "\"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.KernelModeTime + $_.UserModeTime)`t$($_.CommandLine)\" }";
        const out = Bun.spawnSync(["powershell", "-NoProfile", "-Command", script]).stdout.toString();
        for (const line of out.split("\n")) {
            const [pid, ppid, cpu, ...cmd] = line.trimEnd().split("\t");
            // Kernel + user time are in 100 ns units.
            if (pid) table.set(Number(pid), { ppid: Number(ppid), cpu: Number(cpu) / 1e7, cmd: cmd.join("\t") });
        }
        return table;
    }
    for (const entry of readdirSync("/proc")) {
        if (!/^\d+$/.test(entry)) continue;
        try {
            const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
            const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
            const cmd = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll("\0", " ").trim();
            table.set(Number(entry), {
                ppid: Number(fields[1]),
                cpu: (Number(fields[11]) + Number(fields[12])) / 100,
                cmd,
            });
        } catch {}
    }
    return table;
}

/** True when `pid` is this process or one of its ancestors. */
function isAncestor(pid: number, table: Map<number, ProcessInfo>): boolean {
    for (let cur = process.pid, depth = 0; cur > 0 && depth < 64; depth++) {
        if (cur === pid) return true;
        cur = table.get(cur)?.ppid ?? 0;
    }
    return false;
}

/** CPU seconds used by a process and all its descendants. */
function treeCpu(root: number, table: Map<number, ProcessInfo>): number {
    let total = 0;
    const stack = [root];
    while (stack.length) {
        const pid = stack.pop()!;
        total += table.get(pid)?.cpu ?? 0;
        for (const [child, info] of table) if (info.ppid === pid && child !== pid) stack.push(child);
    }
    return total;
}

/** A lock holder whose process tree used no CPU for this long, while others wait, is reported. */
const STALE_HOLDER_MS = Number(process.env.SPARKUS_BENCH_STALE_MS ?? 3 * 60_000);

/**
 * One benchmark at a time on this machine, across every checkout and worktree:
 * two benches in parallel would measure each other. The lock holds the PID of
 * its owner; a lock left by a dead process is taken over. Waiters queue up in
 * arrival order (one file each, named <arrival ms>-<pid>), so a long wait is
 * not lost to whoever polls first when the lock is released.
 */
export async function acquireMachineLock(): Promise<void> {
    const path = join(tmpdir(), "sparkus-bench.lock");
    // An ancestor (with-lock.ts, or a run.ts that spawned us) already holds the lock:
    // waiting for it would be a deadlock. The holder exports its PID to its children.
    const inherited = process.env.SPARKUS_BENCH_LOCK_OWNER;
    let current = "";
    try {
        current = readFileSync(path, "utf8");
    } catch {}
    if (inherited && current === inherited && isAlive(Number(inherited))) return;
    if (current && isAlive(Number(current)) && isAncestor(Number(current), processTable())) {
        // Holder without the variable (older lock code): same deadlock, same answer.
        console.log(`The bench lock is held by an ancestor process (PID ${current}); not waiting for it.`);
        return;
    }
    const queue = join(tmpdir(), "sparkus-bench.queue");
    mkdirSync(queue, { recursive: true });
    const ticket = `${String(Date.now()).padStart(15, "0")}-${process.pid}`;
    writeFileSync(join(queue, ticket), "");
    const leaveQueue = () => rmSync(join(queue, ticket), { force: true });
    process.on("exit", leaveQueue);

    /** True when no live process queued before us. */
    const myTurn = () => {
        for (const entry of readdirSync(queue).sort()) {
            if (entry === ticket) return true;
            if (isAlive(Number(entry.split("-")[1]))) return false;
            rmSync(join(queue, entry), { force: true });
        }
        return true;
    };

    let announced = false;
    // Progress of the holder's process tree, to report a holder that does nothing.
    let watch = { owner: 0, cpu: 0, since: Date.now(), checked: 0, reported: 0 };
    for (;;) {
        if (myTurn()) {
            try {
                const fd = openSync(path, "wx");
                writeFileSync(fd, String(process.pid));
                closeSync(fd);
                leaveQueue();
                process.env.SPARKUS_BENCH_LOCK_OWNER = String(process.pid);
                process.on("exit", () => {
                    try {
                        if (readFileSync(path, "utf8") === String(process.pid)) rmSync(path);
                    } catch {}
                });
                return;
            } catch (error: any) {
                if (error.code !== "EEXIST") throw error;
            }
        }
        let owner = NaN;
        try {
            owner = Number(readFileSync(path, "utf8"));
        } catch {}
        if (existsSync(path) && !isAlive(owner)) {
            rmSync(path, { force: true });
            continue;
        }
        if (!announced) {
            console.log(`Another benchmark is running or queued first (lock owner PID ${owner}); waiting...`);
            announced = true;
        }
        if (isAlive(owner) && Date.now() - watch.checked >= Math.min(30_000, STALE_HOLDER_MS / 2)) {
            const table = processTable();
            const cpu = treeCpu(owner, table);
            if (watch.owner !== owner || cpu - watch.cpu > 0.5) watch = { owner, cpu, since: Date.now(), checked: 0, reported: 0 };
            watch.checked = Date.now();
            if (Date.now() - watch.since >= STALE_HOLDER_MS && Date.now() - watch.reported >= STALE_HOLDER_MS) {
                watch.reported = Date.now();
                console.log(
                    `!! The bench lock holder PID ${owner} and its children used no CPU for ` +
                        `${Math.round((Date.now() - watch.since) / 60_000)} min: it is probably hung, or waiting for the ` +
                        `lock it holds itself. Command line: ${table.get(owner)?.cmd ?? "?"}\n` +
                        `   If it is yours, stop that PID; otherwise tell its owner.`,
                );
            }
        }
        await Bun.sleep(1_000);
    }
}

/** CPU seconds consumed so far, current and peak resident memory of a live process. */
export function processStats(pid: number): { cpu: number; rss: number; peak: number } {
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

/**
 * CPU layout for pinning: the server gets one whole physical core (both SMT
 * siblings, so nothing else runs beside it), the load generator gets the upper
 * half of the cores, and the rest is left to the OS. Windows numbers SMT
 * siblings 2k and 2k+1; Linux tells us in sysfs.
 */
export function cpuLayout(cores?: number[]): { server: number[]; loader: number[] } {
    if (cores) {
        // A slot of the machine (e.g. CPUs 0-7): its first physical core is left to
        // the OS and the runner, the second goes to the server, the upper half to autocannon.
        if (cores.length < 6) throw new Error(`--cores needs at least 6 logical CPUs, got ${cores.join(",")}.`);
        return { server: cores.slice(2, 4), loader: cores.slice(cores.length / 2) };
    }
    const siblings = (cpu: number): number[] => {
        if (process.platform === "linux") {
            try {
                const list = readFileSync(`/sys/devices/system/cpu/cpu${cpu}/topology/thread_siblings_list`, "utf8");
                return list.trim().split(",").flatMap((part) => {
                    const [a, b] = part.split("-").map(Number);
                    return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, i) => a! + i);
                });
            } catch {}
        }
        return logicalCpus >= 4 && logicalCpus % 2 === 0 ? [cpu - (cpu % 2), cpu - (cpu % 2) + 1] : [cpu];
    };
    // Core 0 takes most interrupts: the server goes on the next core.
    const server = siblings(siblings(0).length === 2 ? 2 : 1);
    const loader: number[] = [];
    for (let cpu = Math.floor(logicalCpus / 2); cpu < logicalCpus; cpu++) if (!server.includes(cpu)) loader.push(cpu);
    return { server, loader };
}

/** Restricts a running process (all its threads) to the given logical CPUs. */
export function setAffinity(pid: number, cpus: number[]): void {
    let out;
    if (process.platform === "win32") {
        const mask = cpus.reduce((m, cpu) => m | (1n << BigInt(cpu)), 0n);
        out = Bun.spawnSync([
            "powershell", "-NoProfile", "-Command",
            `(Get-Process -Id ${pid}).ProcessorAffinity = [IntPtr]${mask}`,
        ], { stderr: "pipe" });
    } else {
        out = Bun.spawnSync(["taskset", "-a", "-p", "-c", cpus.join(","), String(pid)], { stdout: "ignore", stderr: "pipe" });
    }
    if (out.exitCode !== 0) throw new Error(`Cannot pin PID ${pid} to CPUs ${cpus.join(",")}: ${out.stderr.toString().trim()}`);
}

/** CPU seconds used by a child process that has exited (Bun reports it in µs). */
export function exitedCpuSeconds(proc: Bun.Subprocess): number {
    const usage = proc.resourceUsage();
    return usage ? Number(usage.cpuTime.total) / 1e6 : NaN;
}

export interface SystemTick {
    /** Unix ms. */
    t: number;
    /** Effective clock in % of the nominal clock (>100 = boost). NaN when unknown. */
    perf: number;
    /** Whole machine busy time, in % of one logical CPU (0 to logicalCpus x 100). */
    busy: number;
}

/**
 * Samples the machine once a second in the background. Windows: one long-lived
 * PowerShell reading the (non-localized) WMI processor counters. Linux: /proc/stat
 * and cpufreq. The sampler itself costs about the same for every target.
 */
export class SystemSampler {
    readonly ticks: SystemTick[] = [];
    private proc: Bun.Subprocess<"ignore", "pipe", "ignore"> | undefined;
    private timer: ReturnType<typeof setInterval> | undefined;

    start(): this {
        if (process.platform === "win32") this.startWindows();
        else if (process.platform === "linux") this.startLinux();
        return this;
    }

    stop(): void {
        this.proc?.kill();
        if (this.timer) clearInterval(this.timer);
    }

    /** Averages over [from, to] (Unix ms); NaN when no tick fell in the window. */
    window(from: number, to: number): { perf: number; busy: number } {
        const inside = this.ticks.filter((x) => x.t >= from && x.t <= to);
        const avg = (key: "perf" | "busy") => inside.reduce((sum, x) => sum + x[key], 0) / inside.length;
        return { perf: avg("perf"), busy: avg("busy") };
    }

    private startWindows(): void {
        const script =
            "while ($true) { $p = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter \"Name='_Total'\"; " +
            "[Console]::Out.WriteLine(\"$([DateTimeOffset]::Now.ToUnixTimeMilliseconds());$($p.PercentProcessorPerformance);$($p.PercentProcessorTime)\"); " +
            "[Console]::Out.Flush(); Start-Sleep -Milliseconds 1000 }";
        const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", script], { stdout: "pipe", stderr: "ignore" });
        this.proc = proc;
        (async () => {
            let buffer = "";
            const decoder = new TextDecoder();
            for await (const chunk of proc.stdout) {
                buffer += decoder.decode(chunk);
                let nl;
                while ((nl = buffer.indexOf("\n")) >= 0) {
                    const [t, perf, busy] = buffer.slice(0, nl).trim().split(";").map(Number);
                    buffer = buffer.slice(nl + 1);
                    // PercentProcessorTime is an average over all logical CPUs.
                    if (Number.isFinite(t)) this.ticks.push({ t: t!, perf: perf!, busy: busy! * logicalCpus });
                }
            }
        })();
    }

    private startLinux(): void {
        const readStat = () => {
            const [, ...cols] = readFileSync("/proc/stat", "utf8").split("\n")[0]!.trim().split(/\s+/);
            const n = cols.map(Number);
            const idle = n[3]! + n[4]!;
            return { idle, total: n.reduce((a, b) => a + b, 0) };
        };
        const readPerf = () => {
            try {
                let cur = 0;
                let max = 0;
                for (let i = 0; i < logicalCpus; i++) {
                    const dir = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
                    cur += Number(readFileSync(`${dir}/scaling_cur_freq`, "utf8"));
                    let base: string;
                    try {
                        base = readFileSync(`${dir}/base_frequency`, "utf8");
                    } catch {
                        base = readFileSync(`${dir}/cpuinfo_max_freq`, "utf8");
                    }
                    max += Number(base);
                }
                return (cur / max) * 100;
            } catch {
                return NaN;
            }
        };
        let last = readStat();
        this.timer = setInterval(() => {
            const now = readStat();
            const busy = 1 - (now.idle - last.idle) / (now.total - last.total || 1);
            last = now;
            this.ticks.push({ t: Date.now(), perf: readPerf(), busy: busy * 100 * logicalCpus });
        }, 1000);
    }
}
