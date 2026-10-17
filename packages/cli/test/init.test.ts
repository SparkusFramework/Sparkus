import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { initProject, packageName } from "../src/init.js";
import { main } from "../src/main.js";

// Inside the repo so the generated app resolves "sparkus" from the workspace.
const root = join(import.meta.dir, "tmp-init");
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("sparkus init", () => {
    test("package names", () => {
        expect(packageName("My API!")).toBe("my-api");
        expect(packageName("___")).toBe("sparkus-app");
    });

    test("generates a project that passes check and its own tests", async () => {
        rmSync(root, { recursive: true, force: true });
        const { files } = initProject("tmp-init", import.meta.dir);
        const expected = [
            "AGENTS.md",
            "CLAUDE.md",
            ".claude/settings.json",
            ".claude/skills/add-endpoint/SKILL.md",
            ".claude/skills/add-guard/SKILL.md",
            "src/app.ts",
            "src/config.ts",
            ".env.example",
        ];
        for (const file of expected) {
            expect(files).toContain(file);
            expect(existsSync(join(root, file))).toBe(true);
        }
        expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
        expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("tmp-init");

        const out: string[] = [];
        const write = process.stdout.write;
        process.stdout.write = ((chunk: string) => out.push(chunk)) as any;
        try {
            expect(await main(["check", join(root, "src/app.ts"), "--json"])).toBe(0);
        } finally {
            process.stdout.write = write;
        }
        expect(JSON.parse(out.join(""))).toMatchObject({ ok: true, routes: 5 });

        const tests = Bun.spawnSync([process.execPath, "test"], { cwd: root, stdout: "pipe", stderr: "pipe" });
        const report = tests.stderr.toString();
        expect(report).toContain("6 pass");
        expect(tests.exitCode).toBe(0);

        const typecheck = Bun.spawnSync([process.execPath, "check"], { cwd: root, stdout: "pipe", stderr: "pipe" });
        expect(typecheck.exitCode).toBe(0);
    }, 60_000);

    test("the reference AGENTS.md points to ships with the sparkus package", () => {
        const agents = readFileSync(join(import.meta.dir, "..", "src", "templates.ts"), "utf8");
        // "sparkus" resolves to src/index.ts under Bun.
        const sparkus = join(dirname(Bun.resolveSync("sparkus", import.meta.dir)), "..");
        for (const file of ["llms.txt", "docs/errors.md"]) {
            expect(agents).toContain(`node_modules/sparkus/${file}`);
            expect(existsSync(join(sparkus, file))).toBe(true);
            expect(JSON.parse(readFileSync(join(sparkus, "package.json"), "utf8")).files).toContain(file.split("/")[0]);
        }
    });

    test("refuses a folder that is not empty", () => {
        expect(() => initProject("fixtures", import.meta.dir)).toThrow("fixtures is not empty");
    });
});
