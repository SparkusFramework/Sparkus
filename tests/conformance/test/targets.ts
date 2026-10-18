import { createTestApp } from "@sparkus/testing";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "sparkus";
import { fixtureOptions } from "../src/fixture.js";
import { productionOptions } from "../src/production.js";

/** "default": the behavior fixture. "production": every production option on. */
export type Fixture = "default" | "production";

function optionsOf(fixture: Fixture) {
    return fixture === "production" ? productionOptions() : fixtureOptions();
}

export interface Reply {
    status: number;
    headers: Headers;
    text: string;
    json(): any;
}

export interface RequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: "manual";
}

export interface Target {
    name: string;
    /** True when the app runs in this process: its logs and spans can be inspected. */
    local: boolean;
    request(path: string, init?: RequestInit): Promise<Reply>;
    close(): Promise<void>;
}

async function reply(response: Response): Promise<Reply> {
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text) };
}

export async function inMemory(fixture: Fixture = "default"): Promise<Target> {
    const app = await createTestApp(optionsOf(fixture));
    return {
        name: "in-memory",
        local: true,
        request: async (path, init = {}) => {
            const res = await app.inject({ url: path, method: init.method, headers: init.headers, body: init.body });
            return { status: res.status, headers: res.headers, text: res.text, json: res.json };
        },
        close: () => app.close(),
    };
}

export function overHttp(name: string, base: string, close: () => Promise<void>, local: boolean): Target {
    return {
        name,
        local,
        request: async (path, init = {}) => reply(await fetch(base + path, init)),
        close,
    };
}

export async function inProcess(engine: "bun" | "node", fixture: Fixture = "default"): Promise<Target> {
    const app = createApp({ ...optionsOf(fixture), engine });
    const { port } = await app.listen({ port: 0, hostname: "127.0.0.1", signals: false });
    return overHttp(`${engine} engine (in Bun)`, `http://127.0.0.1:${port}`, () => app.close(), true);
}

export const nodeBin = process.env.NODE_BIN ?? "node";
export const serverScript = join(import.meta.dir, "..", "dist", "server.js");

/** Starts the compiled fixture in a separate process and waits for its port. */
export async function spawnServer(runtime: string, env: Record<string, string> = {}) {
    if (!existsSync(serverScript)) {
        throw new Error(`${serverScript} is missing: run "bun run build" before the conformance tests.`);
    }
    const proc = Bun.spawn([runtime, serverScript], {
        env: { ...process.env, NODE_ENV: "production", ...env },
        stdout: "pipe",
        stderr: "inherit",
    });
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    const lines: string[] = [];

    const nextLine = async (): Promise<string | undefined> => {
        while (!buffered.includes("\n")) {
            const { done, value } = await reader.read();
            if (done) return undefined;
            buffered += decoder.decode(value, { stream: true });
        }
        const index = buffered.indexOf("\n");
        const line = buffered.slice(0, index);
        buffered = buffered.slice(index + 1);
        lines.push(line);
        return line;
    };

    const first = await Promise.race([
        nextLine(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 15_000)),
    ]);
    if (first === undefined) {
        proc.kill();
        throw new Error(`${runtime} ${serverScript} did not report its port.`);
    }
    const info = JSON.parse(first) as { port: number; engine: string };
    return { proc, info, nextLine, base: `http://127.0.0.1:${info.port}` };
}

export async function realNode(fixture: Fixture = "default"): Promise<Target> {
    const { proc, base } = await spawnServer(nodeBin, { FIXTURE: fixture });
    const version = (await Bun.$`${nodeBin} --version`.text()).trim();
    return overHttp(
        `node engine (Node ${version})`,
        base,
        async () => {
            proc.kill();
            await proc.exited;
        },
        false,
    );
}
