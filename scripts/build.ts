// Builds the JavaScript of every package with Bun's bundler (no tsc): one ESM
// file per entry point in dist/, other packages left as imports. Types are
// checked by `bun check`; declaration files come from `tsc` at publish time
// only (`bun run build:types`).
//
// Also bundles the conformance fixture into one self-contained file, which
// the conformance suite runs in a real Node process, and builds the discovery
// fixture unbundled (one file per controller), as an app deployed without a bundle.
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sparkusPlugin } from "../packages/core/src/build.ts";

const root = join(import.meta.dir, "..");

interface Target {
    dir: string;
    /** Relative to `src` (or `root`). */
    entries: string[];
    /** Source folder below `dir`, and output folder. Default: src/ and dist/. */
    root?: string;
    outdir?: string;
    /** Bundle every import (the fixture) instead of leaving packages external. */
    standalone?: boolean;
    /** Controllers found at build time (sparkusPlugin), as `sparkus build` does. */
    plugin?: boolean;
}

const targets: Target[] = [
    { dir: "packages/core", entries: ["index.ts", "engine.ts", "build.ts"] },
    { dir: "packages/engine-bun", entries: ["index.ts"] },
    { dir: "packages/engine-node", entries: ["index.ts"] },
    { dir: "packages/sparkus", entries: ["index.ts", "build.ts"] },
    { dir: "packages/testing", entries: ["index.ts"] },
    { dir: "packages/cli", entries: ["main.ts", "args.ts"] },
    { dir: "tests/conformance", entries: ["server.ts"], standalone: true },
    {
        dir: "tests/conformance",
        root: "src/discovered",
        outdir: "dist-discovered",
        entries: ["server.ts", ...new Bun.Glob("**/*.controller.ts").scanSync(join(root, "tests/conformance/src/discovered"))],
        standalone: true,
    },
    // The same app bundled: no controller file in dist-bundled/, the manifest replaces the scan.
    { dir: "tests/conformance", root: "src/discovered", outdir: "dist-bundled", entries: ["server.ts", "bundled.ts"], standalone: true, plugin: true },
];

const started = performance.now();
let failed = false;

async function build(target: Target): Promise<void> {
    const dir = join(root, target.dir);
    const src = join(dir, target.root ?? "src");
    const outdir = join(dir, target.outdir ?? "dist");
    rmSync(outdir, { recursive: true, force: true });
    const result = await Bun.build({
        entrypoints: target.entries.map((entry) => join(src, entry)),
        root: src,
        outdir,
        target: "node",
        format: "esm",
        sourcemap: "linked",
        packages: target.standalone ? "bundle" : "external",
        // Entry points of one package share their modules (one HttpError class, one
        // Container...) instead of each bundling its own copy: instanceof must hold.
        splitting: target.entries.length > 1,
        plugins: target.plugin ? [sparkusPlugin()] : [],
    });
    if (!result.success) {
        failed = true;
        console.error(`${target.dir}: build failed`);
        for (const log of result.logs) console.error(log);
    }
}

// Packages first: the fixtures bundle their dist/ (target node), which must be complete.
await Promise.all(targets.filter((target) => !target.standalone).map(build));
await Promise.all(targets.filter((target) => target.standalone).map(build));

if (failed) process.exit(1);

// The reference an agent reads in a generated project (its AGENTS.md points there):
// node_modules/sparkus/llms.txt and node_modules/sparkus/docs/errors.md.
cpSync(join(root, "llms.txt"), join(root, "packages/sparkus/llms.txt"));
cpSync(join(root, "docs/errors.md"), join(root, "packages/sparkus/docs/errors.md"));
console.log(`Built ${targets.length} targets in ${Math.round(performance.now() - started)} ms.`);
