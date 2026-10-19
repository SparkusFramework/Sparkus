/**
 * What finding controllers on disk costs at startup, against listing them: a generated app
 * with N controller files (one service each, 5 routes each), started in a fresh process
 * that inits the app and exits. Two entries per app, same files: `listed.ts` imports every
 * controller and passes the list, `found.ts` calls createApp() alone. Measured from the
 * TypeScript sources under Bun, from an unbundled build (one JS file per TS file, as deployed
 * without a bundle) and from a bundle built with sparkusPlugin() (controllers found at build
 * time, no scan at startup), under Bun and Node. Runs are interleaved; medians reported.
 *
 *   bun discovery.ts [--runs 15] [--controllers 20,100,400]
 *
 * NODE_BIN selects Node. Takes the machine-wide bench lock.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sparkusPlugin } from "sparkus/build";
import { acquireMachineLock } from "./system.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);
const runs = Number(args.get("runs") ?? 15);
const counts = (args.get("controllers") ?? "20,100,400").split(",").map(Number);
const nodeBin = process.env.NODE_BIN ?? "node";
const work = join(import.meta.dir, "results", "discovery");

const REPORT = `const app = createApp({ CONTROLLERS logger: false });
await app.init();
process.stdout.write(JSON.stringify({ routes: app.routes.length, readyMs: performance.now() }) + "\\n");
`;

/** A package with `count` feature folders; returns its folder. */
function generate(count: number): string {
    const root = join(work, String(count));
    rmSync(root, { recursive: true, force: true });
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
        const dir = join(root, "src", `f${i}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `f${i}.service.ts`), `export class F${i}Service {\n    get(id: number) {\n        return { id, feature: ${i} };\n    }\n}\n`);
        const routes = ["Get", "Post", "Put", "Patch", "Delete"]
            .map((verb, r) => `    @${verb}("/:id", ById)\n    r${r}(ctx: Ctx<typeof ById>) {\n        return this.service.get(ctx.params.id);\n    }\n`)
            .join("\n");
        writeFileSync(
            join(dir, `f${i}.controller.ts`),
            `import { Controller, Delete, Get, Patch, Post, Put, inject, t, type Ctx } from "sparkus";\n` +
                `import { F${i}Service } from "./f${i}.service.js";\n\n` +
                `const ById = { params: t.object({ id: t.integer({ min: 1 }) }) };\n\n` +
                `@Controller("/f${i}")\nexport class F${i}Controller {\n    private readonly service = inject(F${i}Service);\n\n${routes}}\n`,
        );
        names.push(`F${i}Controller`);
    }
    writeFileSync(join(root, "package.json"), `{ "private": true, "type": "module" }\n`);
    const imports = names.map((name, i) => `import { ${name} } from "./f${i}/f${i}.controller.js";\n`).join("");
    writeFileSync(
        join(root, "src", "listed.ts"),
        `import { createApp } from "sparkus";\n${imports}\n` + REPORT.replace("CONTROLLERS", `controllers: [${names.join(", ")}],`),
    );
    writeFileSync(join(root, "src", "found.ts"), `import { createApp } from "sparkus";\n\n` + REPORT.replace("CONTROLLERS ", ""));
    return root;
}

/**
 * One JS file per TS file in dist/, imports kept as they are: what tsc emits, and what an app
 * deployed without a bundle loads. (Bun.build with `splitting` would not do: `listed.js` would
 * import the controllers' chunks directly, `found.js` their entry files and then the chunks.)
 * "sparkus" stays external and resolves from bench/node_modules: run `bun run build` first.
 */
async function build(root: string): Promise<void> {
    const src = join(root, "src");
    const result = await Bun.build({
        entrypoints: [...new Bun.Glob("**/*.ts").scanSync({ cwd: src, absolute: true })],
        root: src,
        outdir: join(root, "dist"),
        target: "node",
        format: "esm",
        external: ["*"],
    });
    if (!result.success) throw new AggregateError(result.logs, `build of ${root} failed`);
}

/** Each entry bundled on its own into bundle/, as `sparkus build --target node` does. */
async function bundle(root: string): Promise<void> {
    for (const entry of ["listed", "found"]) {
        const result = await Bun.build({
            entrypoints: [join(root, "src", `${entry}.ts`)],
            outdir: join(root, "bundle"),
            target: "node",
            format: "esm",
            plugins: [sparkusPlugin()],
        });
        if (!result.success) throw new AggregateError(result.logs, `bundle of ${root}/${entry} failed`);
    }
}

interface Case {
    name: string;
    bin: string;
    file: string;
    count: number;
}

interface Sample {
    wallMs: number;
    readyMs: number;
}

async function once(c: Case): Promise<Sample> {
    const start = performance.now();
    const proc = Bun.spawn([c.bin, c.file], { env: { ...process.env, NODE_ENV: "production" }, stdout: "pipe", stderr: "pipe" });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const wallMs = performance.now() - start;
    if (code !== 0) throw new Error(`${c.name} exited with ${code}: ${await new Response(proc.stderr).text()}`);
    const report = JSON.parse(out.trim()) as { routes: number; readyMs: number };
    if (report.routes !== c.count * 5) throw new Error(`${c.name}: ${report.routes} routes, expected ${c.count * 5}`);
    return { wallMs, readyMs: report.readyMs };
}

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
};

await acquireMachineLock();
const cases: Case[] = [];
for (const count of counts) {
    const root = generate(count);
    await build(root);
    await bundle(root);
    for (const entry of ["listed", "found"]) {
        cases.push({ name: `${count} bun src ${entry}`, bin: process.execPath, file: join(root, "src", `${entry}.ts`), count });
        cases.push({ name: `${count} bun dist ${entry}`, bin: process.execPath, file: join(root, "dist", `${entry}.js`), count });
        cases.push({ name: `${count} node dist ${entry}`, bin: nodeBin, file: join(root, "dist", `${entry}.js`), count });
        cases.push({ name: `${count} bun bundle ${entry}`, bin: process.execPath, file: join(root, "bundle", `${entry}.js`), count });
        cases.push({ name: `${count} node bundle ${entry}`, bin: nodeBin, file: join(root, "bundle", `${entry}.js`), count });
    }
}

const nodeVersion = Bun.spawnSync([nodeBin, "-v"]).stdout.toString().trim();
console.log(`Discovery: ${cases.length} cases x ${runs} runs, Bun ${Bun.version}, Node ${nodeVersion}, ${process.platform}`);
// One warm-up per case: fills the OS file cache and Bun's transpiler cache.
for (const c of cases) await once(c);
const samples = new Map<string, Sample[]>(cases.map((c) => [c.name, []]));
for (let run = 0; run < runs; run++) for (const c of shuffle(cases)) samples.get(c.name)!.push(await once(c));

const lines = [
    "| Contrôleurs | Runtime | Sources | Listés : prêt (ms) | Trouvés : prêt (ms) | Écart | Listés : process (ms) | Trouvés : process (ms) |",
    "|---:|---|---|---:|---:|---:|---:|---:|",
];
for (const count of counts) {
    for (const [runtime, sources] of [["bun", "src"], ["bun", "dist"], ["node", "dist"], ["bun", "bundle"], ["node", "bundle"]] as const) {
        const listed = samples.get(`${count} ${runtime} ${sources} listed`)!;
        const found = samples.get(`${count} ${runtime} ${sources} found`)!;
        const l = median(listed.map((s) => s.readyMs));
        const f = median(found.map((s) => s.readyMs));
        lines.push(
            `| ${count} | ${runtime} | ${sources} | ${l.toFixed(1)} | ${f.toFixed(1)} | ${f - l >= 0 ? "+" : ""}${(f - l).toFixed(1)} | ` +
                `${median(listed.map((s) => s.wallMs)).toFixed(0)} | ${median(found.map((s) => s.wallMs)).toFixed(0)} |`,
        );
    }
}
console.log(lines.join("\n"));
