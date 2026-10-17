import type { CompiledRoute } from "../compile.js";
import type { Ctx } from "../decorators.js";
import { parseQuery } from "../query.js";
import { INVALID_JSON, NOT_FOUND, errorPayload, validationBody, type Serve } from "./shared.js";

type BunRequest = Request & { params: Record<string, string> };
type BunHandler = (req: BunRequest) => Response | Promise<Response>;

class BunCtx implements Ctx<any> {
    private parsedQuery: Record<string, string | undefined> | undefined;

    constructor(
        private readonly req: BunRequest,
        readonly params: Record<string, string>,
        readonly body: any,
    ) {}

    get query(): Record<string, string | undefined> {
        if (this.parsedQuery === undefined) {
            const url = this.req.url;
            const index = url.indexOf("?");
            this.parsedQuery = parseQuery(index === -1 ? "" : url.slice(index + 1));
        }
        return this.parsedQuery;
    }

    header(name: string): string | undefined {
        return this.req.headers.get(name) ?? undefined;
    }
}

function respond(value: unknown, init: ResponseInit): Response {
    if (value === undefined) return new Response(null, { status: 204 });
    if (value instanceof Response) return value;
    return Response.json(value, init);
}

function fail(error: unknown): Response {
    const { status, body } = errorPayload(error);
    return Response.json(body, { status });
}

function createHandler(route: CompiledRoute): BunHandler {
    const init: ResponseInit = { status: route.status };
    const { invoke, validate } = route;

    if (validate === null) {
        return (req) => {
            let out: unknown;
            try {
                out = invoke(new BunCtx(req, req.params, undefined));
            } catch (error) {
                return fail(error);
            }
            return out instanceof Promise ? out.then((value) => respond(value, init), fail) : respond(out, init);
        };
    }

    return async (req) => {
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return Response.json(INVALID_JSON, { status: 400 });
        }

        const issue = validate(body);
        if (issue !== null) return Response.json(validationBody(issue), { status: 400 });

        try {
            return respond(await invoke(new BunCtx(req, req.params, body)), init);
        } catch (error) {
            return fail(error);
        }
    };
}

/**
 * Registers every route in Bun's native router: matching and parameter
 * extraction happen in Bun, not in JavaScript.
 */
export const serve: Serve = async (routes, { port, hostname }) => {
    const table: Record<string, Record<string, BunHandler>> = {};
    for (const route of routes) (table[route.path] ??= {})[route.method] = createHandler(route);

    const server = Bun.serve({
        port,
        hostname,
        routes: table as any,
        fetch: () => Response.json(NOT_FOUND, { status: 404 }),
    });

    return {
        engine: "bun",
        port: server.port!,
        stop: () => server.stop(true),
    };
};
