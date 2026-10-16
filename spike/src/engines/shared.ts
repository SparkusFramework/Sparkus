import { HttpError } from "../errors.js";
import type { CompiledRoute } from "../compile.js";
import type { Issue } from "../schema.js";

export interface ServeOptions {
    port: number;
    hostname: string;
}

export interface RunningServer {
    engine: "bun" | "node";
    port: number;
    stop(): Promise<void>;
}

export type Serve = (routes: CompiledRoute[], options: ServeOptions) => Promise<RunningServer>;

export const NOT_FOUND = { error: "Not Found" };
export const INVALID_JSON = { error: "Bad Request", message: "Body is not valid JSON" };

export function validationBody(issue: Issue) {
    return { error: "Bad Request", issues: [issue] };
}

export function errorPayload(error: unknown): { status: number; body: unknown } {
    if (error instanceof HttpError) {
        const body = error.details === undefined ? { error: error.message } : { error: error.message, details: error.details };
        return { status: error.status, body };
    }
    console.error(error);
    return { status: 500, body: { error: "Internal Server Error" } };
}
