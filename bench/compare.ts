// Paired ratios between two targets of one session, round by round: what an option costs.
//
//     bun compare.ts results/<session>.json sparkus-prod-bun:sparkus-bun fastify-logger:fastify
//
// Same verdicts as the A/B table of run.ts: "prouvé" when every round (5 or more) is on the
// same side, "≈" when rounds disagree.
import { readFileSync } from "node:fs";

interface Sample {
    round: number;
    target: string;
    scenario: string;
    rps: number;
    reqPerCpuSec: number;
}

const [file, ...pairs] = process.argv.slice(2);
if (file === undefined || pairs.length === 0) {
    console.error("usage: bun compare.ts <session.json> <a>:<b> [<a>:<b> ...]");
    process.exit(2);
}
const samples = (JSON.parse(readFileSync(file, "utf8")) as { samples: Sample[] }).samples;
const PROOF_ROUNDS = 5;

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)} %`;
const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const verdict = (xs: number[]) => {
    const same = xs.every((x) => x > 0) || xs.every((x) => x < 0);
    if (!same) return "≈";
    return xs.length >= PROOF_ROUNDS ? "prouvé" : "indicatif";
};
const show = (xs: number[]) => (xs.length === 0 ? "–" : `${pct(median(xs))} (${pct(Math.min(...xs))} – ${pct(Math.max(...xs))})`);

console.log("| A / B | Scénario | req/s | verdict | req par s CPU | verdict |");
console.log("|---|---|---:|---|---:|---|");
for (const pair of pairs) {
    const [a, b] = pair.split(":") as [string, string];
    const scenarios = [...new Set(samples.filter((s) => s.target === a).map((s) => s.scenario))];
    for (const scenario of scenarios) {
        const of = (target: string) => new Map(samples.filter((s) => s.target === target && s.scenario === scenario).map((s) => [s.round, s]));
        const left = of(a);
        const right = of(b);
        const rps: number[] = [];
        const eff: number[] = [];
        for (const [round, x] of left) {
            const y = right.get(round);
            if (y === undefined) continue;
            rps.push(x.rps / y.rps - 1);
            eff.push(x.reqPerCpuSec / y.reqPerCpuSec - 1);
        }
        console.log(`| ${a} / ${b} | ${scenario} | ${show(rps)} | ${verdict(rps)} | ${show(eff)} | ${verdict(eff)} |`);
    }
}
