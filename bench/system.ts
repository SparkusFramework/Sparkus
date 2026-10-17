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

/**
 * One benchmark at a time on this machine, across every checkout and worktree:
 * two benches in parallel would measure each other. The lock holds the PID of
 * its owner; a lock left by a dead process is taken over. Waiters queue up in
 * arrival order (one file each, named <arrival ms>-<pid>), so a long wait is
 * not lost to whoever polls first when the lock is released.
 */
export async function acquireMachineLock(): Promise<void> {
    const path = join(tmpdir(), "sparkus-bench.lock");
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
    for (;;) {
        if (myTurn()) {
            try {
                const fd = openSync(path, "wx");
                writeFileSync(fd, String(process.pid));
                closeSync(fd);
                leaveQueue();
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
export function cpuLayout(): { server: number[]; loader: number[] } {
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
