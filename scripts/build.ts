// Builds the JavaScript of every package with Bun's bundler (no tsc): one ESM
// file per entry point in dist/, other packages left as imports. Types are
// checked by `bun check`; declaration files come from `tsc` at publish time
// only (`bun run build:types`).
//
// Also bundles the conformance fixture into one self-contained file, which
// the conformance suite runs in a real Node process.
import { rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

interface Target {
    dir: string;
    entries: string[];
    /** Bundle every import (the fixture) instead of leaving packages external. */
    standalone?: boolean;
}

const targets: Target[] = [
    { dir: "packages/core", entries: ["index.ts", "engine.ts"] },
    { dir: "packages/engine-bun", entries: ["index.ts"] },
    { dir: "packages/engine-node", entries: ["index.ts"] },
    { dir: "packages/sparkus", entries: ["index.ts"] },
    { dir: "packages/testing", entries: ["index.ts"] },
    { dir: "packages/cli", entries: ["main.ts", "args.ts"] },
    { dir: "tests/conformance", entries: ["server.ts"], standalone: true },
];

const started = performance.now();
let failed = false;

await Promise.all(
    targets.map(async (target) => {
        const dir = join(root, target.dir);
        const outdir = join(dir, "dist");
        rmSync(outdir, { recursive: true, force: true });
        const result = await Bun.build({
            entrypoints: target.entries.map((entry) => join(dir, "src", entry)),
            root: join(dir, "src"),
            outdir,
            target: "node",
            format: "esm",
            sourcemap: "linked",
            packages: target.standalone ? "bundle" : "external",
            // Entry points of one package share their modules (one HttpError class, one
            // Container...) instead of each bundling its own copy: instanceof must hold.
            splitting: target.entries.length > 1,
        });
        if (!result.success) {
            failed = true;
            console.error(`${target.dir}: build failed`);
            for (const log of result.logs) console.error(log);
        }
    }),
);

if (failed) process.exit(1);
console.log(`Built ${targets.length} targets in ${Math.round(performance.now() - started)} ms.`);
