// Files written by `sparkus init`. Kept as plain strings so the CLI stays a
// single file once compiled. `__NAME__` is replaced by the project name.

export const VERSION_RANGE = "^1.0.0-alpha.0";

export function projectFiles(name: string): Record<string, string> {
    const files: Record<string, string> = {
        "package.json": JSON.stringify(
            {
                name,
                private: true,
                type: "module",
                scripts: {
                    dev: "sparkus dev",
                    start: "bun src/main.ts",
                    // No "check" script: it would shadow `bun check` (the type checker).
                    test: "bun test",
                    typecheck: "bun check",
                },
                dependencies: { sparkus: VERSION_RANGE },
                devDependencies: { "@sparkus/cli": VERSION_RANGE, "@sparkus/testing": VERSION_RANGE, "@types/bun": "^1.3.0" },
            },
            null,
            4,
        ),
        "tsconfig.json": JSON.stringify(
            {
                compilerOptions: {
                    target: "ES2022",
                    module: "Preserve",
                    moduleResolution: "Bundler",
                    allowImportingTsExtensions: true,
                    strict: true,
                    noUncheckedIndexedAccess: true,
                    verbatimModuleSyntax: true,
                    skipLibCheck: true,
                    noEmit: true,
                    types: ["bun"],
                },
                include: ["src"],
            },
            null,
            4,
        ),
        ".gitignore": "node_modules\ndist\n.env\n",
        ".env.example": ENV_EXAMPLE,
        "src/app.ts": APP,
        "src/config.ts": CONFIG,
        "src/main.ts": MAIN,
        "src/users/users.service.ts": USERS_SERVICE,
        "src/users/users.controller.ts": USERS_CONTROLLER,
        "src/users/users.test.ts": USERS_TEST,
        "AGENTS.md": AGENTS,
        "CLAUDE.md": "@AGENTS.md\n",
        ".claude/settings.json": JSON.stringify(
            {
                hooks: {
                    PostToolUse: [
                        {
                            matcher: "Edit|Write|MultiEdit",
                            hooks: [{ type: "command", command: "bunx sparkus check --json" }],
                        },
                    ],
                },
            },
            null,
            4,
        ),
        ".claude/skills/add-endpoint/SKILL.md": SKILL_ENDPOINT,
        ".claude/skills/add-service/SKILL.md": SKILL_SERVICE,
        ".claude/skills/add-guard/SKILL.md": SKILL_GUARD,
        ".claude/skills/write-test/SKILL.md": SKILL_TEST,
        ".claude/skills/fix-sparkus-error/SKILL.md": SKILL_ERROR,
    };
    for (const path in files) files[path] = files[path]!.replaceAll("__NAME__", name) + (files[path]!.endsWith("\n") ? "" : "\n");
    return files;
}

const APP = `import { createApp, type Provider } from "sparkus";
import { UserController } from "./users/users.controller.ts";

// Every controller is listed here. Services are not: inject() creates them.
export const controllers = [UserController];

// Values for token()s. Tests reuse both lists: createTestApp({ controllers, providers }).
export const providers: Provider[] = [];

export default createApp({
    controllers,
    providers,
    // One JSON line per request; LOG_LEVEL=debug (or info,users=debug) changes the levels.
    logger: { requests: true },
    // CSP, HSTS, nosniff... on every response. Add cors: { origin: [...] } for browser clients.
    securityHeaders: true,
    // x-request-id in every response, and in every log line of the request.
    requestId: true,
    // GET /health (liveness) and GET /ready (calls every service that implements HealthCheck).
    health: true,
    // 503 SPK2008 after 30 s; ctx.signal aborts. A route can set its own: { timeout: 60_000 }.
    requestTimeout: 30_000,
});
`;

const MAIN = `import app from "./app.ts";

// Logs "Listening on ...". On SIGTERM: /ready fails, then in-flight requests finish before exit.
await app.listen({ shutdownDelay: process.env.NODE_ENV === "production" ? 5_000 : 0 });
`;

const CONFIG = `import { config, t } from "sparkus";

// Environment variables, typed and checked at startup: a missing or invalid one stops the app
// with SPK1018, which lists them all. Bun reads .env itself. Read with inject(AppConfig).
export const AppConfig = config(
    {
        USERS_PAGE_SIZE: t.integer({ min: 1, max: 100, default: 20 }),
    },
    { name: "AppConfig" },
);
`;

const ENV_EXAMPLE = `# Copy to .env. Every variable is declared in src/config.ts.
PORT=3000
USERS_PAGE_SIZE=20
`;

const USERS_SERVICE = `import { Logger, inject } from "sparkus";
import { AppConfig } from "../config.ts";

export interface User {
    id: number;
    name: string;
}

export class UserService {
    private readonly config = inject(AppConfig);
    private readonly log = inject(Logger).child("users");
    private readonly users = new Map<number, User>([[1, { id: 1, name: "Ada" }]]);
    private nextId = 2;

    find(id: number): User | undefined {
        return this.users.get(id);
    }

    list(page: number): User[] {
        const size = this.config.USERS_PAGE_SIZE;
        return [...this.users.values()].slice((page - 1) * size, page * size);
    }

    create(name: string): User {
        const user = { id: this.nextId++, name };
        this.users.set(user.id, user);
        this.log.info("User created", { userId: user.id });
        return user;
    }
}
`;

const USERS_CONTROLLER = `import { Controller, Get, HttpError, Post, inject, t, type Ctx } from "sparkus";
import { UserService } from "./users.service.ts";

const User = t.object({ id: t.integer(), name: t.string() });
const ListUsers = { query: t.object({ page: t.integer({ min: 1, default: 1 }) }), response: t.array(User) };
const GetUser = { params: t.object({ id: t.integer({ min: 1 }) }), response: User };
const CreateUser = { body: t.object({ name: t.string({ min: 1, max: 100 }) }), response: User, status: 201 };

@Controller("/users")
export class UserController {
    private readonly users = inject(UserService);

    @Get("", ListUsers)
    list(ctx: Ctx<typeof ListUsers>) {
        return this.users.list(ctx.query.page);
    }

    @Get("/:id", GetUser)
    get(ctx: Ctx<typeof GetUser>) {
        const user = this.users.find(ctx.params.id);
        if (user === undefined) throw HttpError.notFound(\`User \${ctx.params.id} not found.\`, { code: "USER_NOT_FOUND" });
        return user;
    }

    @Post("", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        return this.users.create(ctx.body.name);
    }
}
`;

const USERS_TEST = `import { createTestApp } from "@sparkus/testing";
import { expect, test } from "bun:test";
import { controllers, providers } from "../app.ts";
import { UserService } from "./users.service.ts";

test("GET /users/:id", async () => {
    const app = await createTestApp({ controllers, providers });
    const res = await app.inject({ url: "/users/1" });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ id: 1, name: "Ada" });
});

test("GET /users pages with the default page size", async () => {
    const app = await createTestApp({ controllers, providers });
    expect((await app.inject({ url: "/users" })).json()).toEqual([{ id: 1, name: "Ada" }]);
    expect((await app.inject({ url: "/users?page=2" })).json()).toEqual([]);
});

test("unknown user is a 404 with a code", async () => {
    const app = await createTestApp({ controllers, providers });
    const res = await app.inject({ url: "/users/99" });
    expect(res.status).toBe(404);
    expect(res.json().code).toBe("USER_NOT_FOUND");
});

test("POST /users validates the body", async () => {
    const app = await createTestApp({ controllers, providers });
    expect((await app.inject({ method: "POST", url: "/users", body: { name: "Grace" } })).status).toBe(201);
    expect((await app.inject({ method: "POST", url: "/users", body: { name: "" } })).json().code).toBe("SPK2004");
});

test("a fake service replaces the real one", async () => {
    const app = await createTestApp({
        controllers,
        providers,
        overrides: [{ provide: UserService, useValue: { find: () => ({ id: 7, name: "Fake" }) } }],
    });
    expect((await app.inject({ url: "/users/7" })).json()).toEqual({ id: 7, name: "Fake" });
});
`;

const AGENTS = `# __NAME__

A Sparkus backend (TypeScript, Bun). Read this before changing code.

## Commands

| Command | Use |
|---|---|
| \`bunx sparkus check --json\` | After every change. Wires the app without starting it; prints the first error with its code, and \`warnings\` (controllers missing from \`src/app.ts\`). |
| \`bun test\` | Run the tests. |
| \`bun check\` | Type check. |
| \`bunx sparkus routes\` | List the routes. |
| \`bun run dev\` | Start with reload on save. |

## Layout

- \`src/app.ts\` lists every controller and provider and exports the app. \`src/main.ts\` starts it.
- One feature per folder: \`src/<feature>/<feature>.controller.ts\`, \`<feature>.service.ts\`, \`<feature>.test.ts\`.
- One class per file.

## Rules

- Controllers: \`@Controller("/prefix")\`, one method per route with \`@Get\`, \`@Post\`, \`@Put\`, \`@Patch\` or \`@Delete\`. Add every controller to \`controllers\` in \`src/app.ts\`.
- Inputs are typed by schemas next to the controller: \`{ params, query, body }\` built with \`t\`. The handler takes \`ctx: Ctx<typeof Route>\`. Never parse or validate \`ctx.params\`, \`ctx.query\` or \`ctx.body\` by hand.
- \`ctx.body\` holds only the fields its schema lists (unknown ones are dropped), so a client cannot sneak in an \`id\` or a \`role\`.
- Declare a \`response\` schema on routes that return records: only its fields are sent, so internal fields (password hashes, foreign keys) never leak. Return entities as they are; do not copy fields by hand.
- Services are plain classes. Get them with \`private readonly x = inject(XService)\` in a field. Never constructor parameters, never \`new\` on a service, never \`inject()\` inside a method. Startup work goes in \`onInit()\`.
- Configuration comes from environment variables declared in \`src/config.ts\` (\`config({ NAME: t.string(), ... })\`, with \`default\` or \`t.optional()\` for optional ones), read with \`inject(AppConfig)\`. Never read \`process.env\` elsewhere. Add new variables to \`.env.example\`. Tests replace it: \`overrides: [{ provide: AppConfig, useValue: { ... } }]\`.
- Logging: \`private readonly log = inject(Logger).child("feature")\` in services, \`ctx.log\` in handlers (adds the request id). \`log.info("What happened", { ids })\`, \`log.error("What failed", error)\`. Never \`console.log\`.
- A service that talks to a database or another server implements \`HealthCheck\` (\`checkHealth()\` throws when it cannot serve): \`/ready\` calls it. Pass \`ctx.signal\` to \`fetch()\` and database calls so they stop with the request.
- Auth is a guard class (add-guard skill). It stores the user in \`ctx.state\`; handlers type it: \`ctx: Ctx<typeof Route, { user: User }>\`.
- Errors: \`throw HttpError.notFound("...", { code: "THING_NOT_FOUND" })\` (also \`badRequest\`, \`unauthorized\`, \`forbidden\`, \`conflict\`). Clients get problem+json with your \`code\`.
- Return plain objects from handlers (sent as JSON). Set \`ctx.status\` or \`ctx.setHeader()\` when needed.
- Tests use \`createTestApp({ controllers, providers })\` and \`inject()\`: no port, no server. Replace a service with \`overrides\`.

## Sparkus errors

Codes \`SPK1xxx\` stop the app at startup, \`SPK2xxx\` are request errors sent to clients. The message names the culprit and the fix. Use the fix-sparkus-error skill.

## Reference

- \`node_modules/sparkus/llms.txt\`: the whole API on one page (routes, schemas, ctx, DI, guards, errors, testing, CLI).
- \`node_modules/sparkus/docs/errors.md\`: every error code, its cause and its fix.
`;

const SKILL_ENDPOINT = `---
name: add-endpoint
description: Add an HTTP endpoint to this Sparkus app (route, typed inputs, test). Use when asked to add or change an API route.
---

1. Find the feature folder in \`src/<feature>/\`, or create one (controller, service, test). New controllers go in \`controllers\` in \`src/app.ts\`.
2. Declare the inputs next to the controller, with \`t\` from "sparkus":

   \`\`\`ts
   const UpdateUser = {
       params: t.object({ id: t.integer({ min: 1 }) }),
       body: t.object({ name: t.string({ min: 1 }) }),
   };
   \`\`\`

   \`params\` must name exactly the path's \`:parameters\`. \`query\` fields are optional with \`t.optional()\`:

   \`\`\`ts
   const ListUsers = { query: t.object({ page: t.optional(t.integer({ min: 1 })) }) };
   // in the handler: const page = ctx.query.page ?? 1;
   \`\`\`
3. Add the method:

   \`\`\`ts
   @Patch("/:id", UpdateUser)
   update(ctx: Ctx<typeof UpdateUser>) {
       return this.users.rename(ctx.params.id, ctx.body.name);
   }
   \`\`\`

   Business logic belongs in the service. Throw \`HttpError\` with a \`code\` for expected failures.
   \`ctx.body\` holds only the fields \`UpdateUser.body\` lists: pass it whole or field by field.
   Behind a guard that sets \`ctx.state.user\`, type it: \`ctx: Ctx<typeof UpdateUser, { user: User }>\`.
4. Add tests in \`<feature>.test.ts\`: the success case and each error (\`res.json().code\`).
5. Run \`bunx sparkus check --json\`, then \`bun test\`.
`;

const SKILL_SERVICE = `---
name: add-service
description: Add a service (business logic, data access) to this Sparkus app and inject it. Use when logic should move out of a controller or be shared.
---

1. Create \`src/<feature>/<feature>.service.ts\` with a plain class, no constructor parameters (Sparkus calls \`new X()\`).
2. Dependencies come from fields: \`private readonly db = inject(Database);\`.
3. Startup work (connections, cache warm-up) goes in \`onInit()\`, cleanup in \`onShutdown()\`. Both may be async.
4. Use it from a controller with \`private readonly things = inject(ThingService);\`. Services are singletons: never \`new\` them, never list them in \`controllers\`.
5. Configuration: add the variable to \`config({ ... })\` in \`src/config.ts\` (\`API_KEY: t.string({ min: 1 })\`) and to \`.env.example\`, then \`private readonly config = inject(AppConfig)\`. For an interface implemented by several classes, use a token: \`export const MAILER = token<Mailer>("MAILER")\`, provided in \`providers\` in \`src/app.ts\`.
6. Log with \`private readonly log = inject(Logger).child("<feature>")\`. A service wrapping a database or remote server implements \`HealthCheck\`: \`checkHealth()\` throws when it cannot serve, and \`/ready\` reports it.
7. Run \`bunx sparkus check --json\`. A dependency cycle is \`SPK1002\`.
`;

const SKILL_TEST = `---
name: write-test
description: Write or fix tests for this Sparkus app with createTestApp and inject(). Use when asked to test an endpoint or a service.
---

\`\`\`ts
import { createTestApp } from "@sparkus/testing";
import { expect, test } from "bun:test";
import { controllers, providers } from "../app.ts";

test("GET /things/:id", async () => {
    const app = await createTestApp({
        controllers,
        providers,
        overrides: [{ provide: ThingRepository, useValue: fakeRepository }],
    });
    const res = await app.inject({ method: "GET", url: "/things/1" });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ id: 1 });
});
\`\`\`

- \`inject()\` runs the full pipeline (routing, guards, validation, errors) in memory. No port.
- Bodies: \`body: { ... }\` is sent as JSON. Headers: \`headers: { authorization: "Bearer ..." }\`.
- Always pass \`providers\` from \`src/app.ts\`: without them, tokens fail with SPK1013. Replace configuration with \`{ provide: AppConfig, useValue: { ... } }\` when a test needs other values.
- Errors are problem+json: assert \`res.status\` and \`res.json().code\`.
- Replace slow or external dependencies with \`overrides\`, never real network calls.
- Run \`bun test\`.
`;

const SKILL_ERROR = `---
name: fix-sparkus-error
description: Diagnose and fix a Sparkus error code (SPK1xxx at startup, SPK2xxx in responses). Use when sparkus check, a test or a response shows an SPK code.
---

Run \`bunx sparkus check --json\`. The message names the class, route or value at fault, then the fix. A \`warnings\` entry names a controller missing from \`controllers\` in \`src/app.ts\` (its routes are 404s). Every code: \`node_modules/sparkus/docs/errors.md\`.

| Code | Usual fix |
|---|---|
| SPK1001 | \`inject()\` only in a field initializer or constructor. |
| SPK1002 | Dependency cycle: move what both classes need into a third service. |
| SPK1003 | Same method and path twice: remove or rename one route. |
| SPK1004 | A class in \`controllers\` lacks \`@Controller()\`; services are never listed there. |
| SPK1006 | Use the same \`:param\` name at the same position in every path. |
| SPK1009 | A constructor threw (see \`cause\`; move I/O to \`onInit()\`), or has parameters: use \`inject()\` in fields. |
| SPK1013 | A \`token()\` has no provider: add it to \`providers\` in \`src/app.ts\`; tests pass \`providers\` to \`createTestApp\`. |
| SPK1016 | An \`onInit()\` threw: see \`cause\`. |
| SPK1014 | Invalid path: static segments and \`:name\` only. |
| SPK1017 | \`params\` must list exactly the path's parameters; schemas are flat scalars; a \`default\` must pass its own schema. |
| SPK1018 | A variable of \`src/config.ts\` is missing or invalid (all are listed): set it in \`.env\`, or give it a \`default\`. |
| SPK1019 | An app option is invalid (CORS origin with a trailing slash, \`origin: "*"\` with credentials): follow the message. |
| SPK2001 / SPK2002 | No route for this path / method. Check \`bunx sparkus routes\`. |
| SPK2003 / SPK2005 | Send a JSON body with \`content-type: application/json\`. |
| SPK2004 | Input does not match the schema: \`issues[0].path\` names the value. |
| SPK2007 | A guard returned something other than \`true\`. Throw \`HttpError.unauthorized(..., { code })\` for a 401. |
| SPK2008 | The request took longer than \`requestTimeout\`: speed it up, or give the route its own \`timeout\`. |
| SPK2009 | \`/ready\` failed: the named \`HealthCheck\` service threw. |
| SPK5000 | Your code threw a non-HttpError: fix it, or map it with \`onError\`. |
`;

const SKILL_GUARD = `---
name: add-guard
description: Protect routes with a guard (bearer token, API key, roles) and pass the authenticated user to handlers. Use when asked for auth or access control.
---

1. Create \`src/auth/auth.guard.ts\`:

   \`\`\`ts
   import { HttpError, inject, type Ctx, type Guard } from "sparkus";
   import { AuthService } from "./auth.service.ts";

   export class AuthGuard implements Guard {
       private readonly auth = inject(AuthService);

       canActivate(ctx: Ctx) {
           const header = ctx.header("authorization");
           if (!header?.startsWith("Bearer ")) throw HttpError.unauthorized("Missing bearer token.", { code: "AUTH_MISSING" });
           const user = this.auth.verify(header.slice(7));
           if (user === undefined) throw HttpError.unauthorized("Invalid bearer token.", { code: "AUTH_INVALID" });
           ctx.state.user = user;
           return true;
       }
   }
   \`\`\`

   Return \`true\` to let the request through; anything else is a 403 (SPK2007). Throw an \`HttpError\` for a 401 or your own code.
2. Apply it: \`@UseGuards(AuthGuard)\` on the controller (every route) or on one method; \`createApp({ guards: [AuthGuard] })\` for the whole app.
3. Handlers read the user through a typed state: \`create(ctx: Ctx<typeof CreateThing, { user: User }>)\`, then \`ctx.state.user\`.
4. Secrets are tokens provided in \`src/app.ts\` (add-service skill). Guards are never listed in \`controllers\`.
5. Test each case: no header (401 and your code), a bad token, a good one: \`inject({ url, headers: { authorization: "Bearer ..." } })\`.
6. Run \`bunx sparkus check --json\`, then \`bun test\`.
`;
