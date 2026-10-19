import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createApp, type SparkusApp } from "../src/index.js";
import { sparkusPlugin } from "../src/build.js";
import { callerFile } from "../src/engine.js";

const fixture = join(import.meta.dir, "fixtures", "discovery");
const handlers = async (app: SparkusApp) => {
    await app.init();
    return app.routes.map((route) => route.handler);
};
// Routes in file order (status.controller.ts, then users/users.controller.ts), exports in module
// namespace order ("VersionController" before "default").
const ALL = ["VersionController.get", "PingController.get", "UserController.list"];

describe("controller discovery", () => {
    test("createApp() scans the source folder of the file calling it", async () => {
        const { default: app } = await import("./fixtures/discovery/src/app.js");
        expect(await handlers(app)).toEqual(ALL);
        const res = await app.fetch(new Request("http://x/users"));
        expect(await res.json()).toEqual([{ id: 1 }]);
        expect((await app.fetch(new Request("http://x/admin"))).status).toBe(404);
    });

    test("from a nested file, the source folder is still the package's top folder", async () => {
        const { build } = await import("./fixtures/discovery/src/users/build.js");
        expect(await handlers(build())).toEqual(ALL);
    });

    test("a string scans that folder, relative to the calling file", async () => {
        const app = createApp({ controllers: "./fixtures/discovery/src/users", logger: false });
        expect(await handlers(app)).toEqual(["UserController.list"]);
    });

    test("an absolute folder or a file URL works from anywhere", async () => {
        const users = join(fixture, "src", "users");
        expect(await handlers(createApp({ controllers: users, logger: false }))).toEqual(["UserController.list"]);
        const url = pathToFileURL(users).href;
        expect(await handlers(createApp({ controllers: url, logger: false }))).toEqual(["UserController.list"]);
    });

    test("a list scans nothing", async () => {
        const { UserController } = await import("./fixtures/discovery/src/users/users.controller.js");
        expect(await handlers(createApp({ controllers: [UserController], logger: false }))).toEqual(["UserController.list"]);
    });
});

describe("discovery errors (SPK1020)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sparkus-discover-"));
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));
    const core = pathToFileURL(join(import.meta.dir, "..", "src", "index.ts")).href;

    /** A package in a temporary folder whose src/app.js calls createApp() with `options`. */
    function pkg(name: string, files: Record<string, string>, options = "{ logger: false }"): Promise<SparkusApp> {
        const root = join(tmp, name);
        files["package.json"] = "{}";
        files["src/app.js"] = `import { createApp } from "${core}";\nexport default createApp(${options});\n`;
        for (const [file, content] of Object.entries(files)) {
            mkdirSync(join(root, file, ".."), { recursive: true });
            writeFileSync(join(root, file), content);
        }
        return import(pathToFileURL(join(root, "src", "app.js")).href).then((module) => module.default);
    }

    test("no controller file", async () => {
        const app = await pkg("empty", { "src/users/users.service.js": "export class UserService {}" });
        expect(app.init()).rejects.toThrow("[SPK1020] No controller file in ");
        expect(app.init()).rejects.toThrow("/src/, the source folder of ");
        expect(app.init()).rejects.toThrow("Name controller files <feature>.controller.ts under it");
    });

    test("node_modules and dot folders are skipped", async () => {
        const app = await pkg("skipped", {
            "src/node_modules/x/x.controller.js": "export {};",
            "src/.cache/y.controller.js": "export {};",
        });
        expect(app.init()).rejects.toThrow("[SPK1020] No controller file in");
    });

    test("a controller file without a controller", async () => {
        const app = await pkg("plain", { "src/users.controller.js": "export class Users {}" });
        expect(app.init()).rejects.toThrow("users.controller.js exports no class with @Controller()");
    });

    test("a controller file that fails to load keeps the cause", async () => {
        const app = await pkg("broken", { "src/users.controller.js": 'import "./missing.js";' });
        const error = (await app.init().catch((e: unknown) => e)) as Error;
        expect(error.message).toContain("[SPK1020]");
        expect(error.message).toContain("users.controller.js failed to load:");
        expect(error.cause).toBeInstanceOf(Error);
    });

    test("a folder that does not exist", async () => {
        const app = await pkg("missing", {}, '{ controllers: "./nowhere", logger: false }');
        expect(app.init()).rejects.toThrow('[SPK1020] controllers: "./nowhere" is not a folder');
    });
});

describe("callerFile", () => {
    test("names the caller and restores the stack trace settings", () => {
        const prepare = Error.prepareStackTrace;
        const limit = Error.stackTraceLimit;
        function api() {
            const file = callerFile(api);
            return { file };
        }
        expect(api().file).toBe(import.meta.path);
        expect(Error.prepareStackTrace).toBe(prepare);
        expect(Error.stackTraceLimit).toBe(limit);
    });
});

describe("sparkusPlugin", () => {
    const out = mkdtempSync(join(tmpdir(), "sparkus-bundle-"));
    afterAll(() => rmSync(out, { recursive: true, force: true }));

    test("a bundle serves the controllers found at build time, without controller files", async () => {
        const seen: Array<[string, readonly string[]]> = [];
        const result = await Bun.build({
            entrypoints: [join(fixture, "src", "print.ts")],
            outdir: out,
            target: "node",
            plugins: [sparkusPlugin({ onControllers: (_entry, root, files) => void seen.push([root, files]) })],
        });
        expect(result.success).toBe(true);
        expect(seen).toHaveLength(1);
        expect(seen[0]![0]).toEndWith("fixtures/discovery/src");
        expect(seen[0]![1].map((file) => file.slice(fixture.length + 1).replaceAll("\\", "/"))).toEqual([
            "src/status.controller.ts",
            "src/users/users.controller.ts",
        ]);
        expect([...new Bun.Glob("**/*.controller.*").scanSync(out)]).toEqual([]);
        writeFileSync(join(out, "package.json"), '{ "type": "module" }');

        for (const runtime of [process.execPath, "node"]) {
            const proc = Bun.spawn([runtime, join(out, "print.js")], { stdout: "pipe", stderr: "pipe" });
            const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
            expect(code, await new Response(proc.stderr).text()).toBe(0);
            expect(JSON.parse(text)).toEqual(ALL);
        }
    });

    test("an entry point without controller files is left as it is", async () => {
        const root = mkdtempSync(join(tmpdir(), "sparkus-plain-"));
        try {
            writeFileSync(join(root, "package.json"), "{}");
            mkdirSync(join(root, "src"));
            writeFileSync(join(root, "src", "main.js"), 'console.log("plain");\n');
            const result = await Bun.build({ entrypoints: [join(root, "src", "main.js")], outdir: join(root, "dist"), plugins: [sparkusPlugin()] });
            expect(result.success).toBe(true);
            expect(await result.outputs[0]!.text()).not.toContain("sparkus.controllers");
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("build manifest", () => {
    const key = Symbol.for("sparkus.controllers");
    async function withManifest<T>(run: () => Promise<T>): Promise<T> {
        const users = await import("./fixtures/discovery/src/users/users.controller.js");
        (globalThis as Record<symbol, unknown>)[key] = { root: "src", files: ["src/users/users.controller.ts"], modules: [users] };
        try {
            return await run();
        } finally {
            delete (globalThis as Record<symbol, unknown>)[key];
        }
    }

    test("serves the manifest's controllers without scanning", async () => {
        // Called from this test file: a scan would look in test/ and find the fixture's controllers too.
        const routes = await withManifest(() => handlers(createApp({ logger: false })));
        expect(routes).toEqual(["UserController.list"]);
    });

    test("a folder option in a bundle", async () => {
        const error = await withManifest(() => createApp({ controllers: "./users", logger: false }).init().catch((e: unknown) => e));
        expect((error as Error).message).toStartWith('[SPK1020] controllers: "./users" in a bundle: its controllers were found at build time, in src/.');
    });
});
