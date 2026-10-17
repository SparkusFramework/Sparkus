/**
 * Runs commands one after another while holding the machine-wide bench lock,
 * for ad hoc measurements (profiles, probes) or to chain several run.ts
 * sessions without letting another bench slip in between:
 *
 *   bun with-lock.ts -- <command> [args...] [--- <command> [args...]]...
 *
 * run.ts started from here sees SPARKUS_BENCH_LOCK_OWNER and does not wait.
 * Stops at the first failing command and exits with its code.
 */
import { acquireMachineLock } from "./system.ts";

const argv = process.argv.slice(2);
if (argv[0] === "--") argv.shift();
const commands: string[][] = [[]];
for (const arg of argv) {
    if (arg === "---") commands.push([]);
    else commands[commands.length - 1]!.push(arg);
}
if (commands.some((c) => c.length === 0)) {
    console.error("Usage: bun with-lock.ts -- <command> [args...] [--- <command> [args...]]...");
    process.exit(2);
}

await acquireMachineLock();
const env = { ...process.env, SPARKUS_BENCH_LOCK_OWNER: String(process.pid) };
for (const cmd of commands) {
    const proc = Bun.spawn(cmd, { env, stdio: ["inherit", "inherit", "inherit"] });
    const code = await proc.exited;
    if (code !== 0) process.exit(code);
}
process.exit(0);
