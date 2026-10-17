// D9 (ROADMAP.md): published packages have zero runtime dependencies besides
// other @sparkus packages. Run in CI: `bun run check:deps`.
import { Glob } from "bun";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const fields = ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"];
const allowed = (name: string) => name === "sparkus" || name.startsWith("@sparkus/");

let failures = 0;
let checked = 0;
for await (const file of new Glob("packages/*/package.json").scan(root)) {
    const pkg = await Bun.file(join(root, file)).json();
    if (pkg.private) continue;
    checked++;
    for (const field of fields) {
        const deps = pkg[field];
        if (deps === undefined) continue;
        const names = Array.isArray(deps) ? deps : Object.keys(deps);
        for (const name of names) {
            if (allowed(name)) continue;
            failures++;
            console.error(`${pkg.name}: "${name}" in ${field} breaks D9 (zero runtime dependencies). See ROADMAP.md.`);
        }
    }
}

if (failures > 0) process.exit(1);
console.log(`D9 ok: ${checked} published packages, no third-party runtime dependency.`);
