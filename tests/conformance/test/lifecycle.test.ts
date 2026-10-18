import { describe, expect, test } from "bun:test";
import { createApp } from "sparkus";
import { events, fixtureOptions } from "../src/fixture.js";
import { nodeBin, spawnServer } from "./targets.js";

for (const engine of ["bun", "node"] as const) {
    describe(`graceful shutdown, ${engine} engine`, () => {
        test("in-flight requests finish, then onShutdown hooks run in reverse order", async () => {
            const app = createApp({ ...fixtureOptions(), engine });
            const startEvents = events.length;
            const { port } = await app.listen({ port: 0, hostname: "127.0.0.1", signals: false });
            const base = `http://127.0.0.1:${port}`;
            expect(events.slice(startEvents)).toEqual(["Clock.onInit", "UserService.onInit"]);

            const inFlight = fetch(base + "/slow").then(async (res) => ({ status: res.status, body: await res.json() }));
            await Bun.sleep(50);
            const closeEvents = events.length;
            await app.close();

            expect(await inFlight).toEqual({ status: 200, body: { slow: true } });
            expect(events.slice(closeEvents)).toEqual(["UserService.onShutdown", "Clock.onShutdown"]);
            expect(fetch(base + "/")).rejects.toThrow();
        });

        test("requests still running after the timeout are cut", async () => {
            const app = createApp({ ...fixtureOptions(), engine });
            const { port } = await app.listen({ port: 0, hostname: "127.0.0.1", signals: false });
            const hanging = fetch(`http://127.0.0.1:${port}/hang`).then(
                () => "answered",
                () => "cut",
            );
            await Bun.sleep(50);
            const started = performance.now();
            await app.close({ timeout: 200 });
            expect(performance.now() - started).toBeLessThan(2_000);
            expect(await hanging).toBe("cut");
        });

        test("a handler slower than idleTimeout still answers (Bun's idle timer runs during handlers)", async () => {
            const app = createApp({ ...fixtureOptions(), engine });
            const { port } = await app.listen({ port: 0, hostname: "127.0.0.1", signals: false, idleTimeout: 1_000 });
            try {
                const res = await fetch(`http://127.0.0.1:${port}/sleep?ms=2500`);
                expect(res.status).toBe(200);
            } finally {
                await app.close();
            }
        }, 10_000);

        test("close() is idempotent", async () => {
            const app = createApp({ ...fixtureOptions(), engine });
            await app.listen({ port: 0, hostname: "127.0.0.1", signals: false });
            await Promise.all([app.close(), app.close()]);
            await app.close();
        });
    });
}

describe.skipIf(process.platform === "win32")("SIGTERM on a real process", () => {
    for (const [label, runtime] of [
        ["Node", nodeBin],
        ["Bun", process.execPath],
    ] as const) {
        test(`${label}: drains, runs onShutdown, exits`, async () => {
            const { proc, base, nextLine } = await spawnServer(runtime, { SPARKUS_FIXTURE_REPORT: "1" });
            const inFlight = fetch(base + "/slow").then((res) => res.status);
            await Bun.sleep(50);
            proc.kill("SIGTERM");

            expect(await inFlight).toBe(200);
            const report = JSON.parse((await nextLine())!);
            expect(report.events.slice(-2)).toEqual(["UserService.onShutdown", "Clock.onShutdown"]);
            await proc.exited;
            expect(proc.signalCode ?? proc.exitCode).toBe("SIGTERM");
        });

        test(`${label}: shutdownDelay keeps serving with readiness failing, then exits`, async () => {
            const { proc, base } = await spawnServer(runtime, { FIXTURE: "production", SHUTDOWN_DELAY: "400" });
            expect((await fetch(base + "/ready")).status).toBe(200);
            proc.kill("SIGTERM");
            await Bun.sleep(100);

            const ready = await fetch(base + "/ready");
            expect(ready.status).toBe(503);
            expect(((await ready.json()) as { detail: string }).detail).toBe("The app is shutting down.");
            expect((await fetch(base + "/health")).status).toBe(200);
            expect((await fetch(base + "/items/1")).status).toBe(200);

            await proc.exited;
            expect(proc.signalCode ?? proc.exitCode).toBe("SIGTERM");
        });
    }
});
