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
        "src/app.ts": APP,
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
        ".claude/skills/write-test/SKILL.md": SKILL_TEST,
        ".claude/skills/fix-sparkus-error/SKILL.md": SKILL_ERROR,
    };
    for (const path in files) files[path] = files[path]!.replaceAll("__NAME__", name) + (files[path]!.endsWith("\n") ? "" : "\n");
    return files;
}

const APP = `import { createApp } from "sparkus";
import { UserController } from "./users/users.controller.ts";

// Every controller is listed here. Services are not: inject() creates them.
export const controllers = [UserController];

export default createApp({ controllers });
`;

const MAIN = `import app from "./app.ts";

const { url, engine } = await app.listen();
console.log(\`__NAME__ listening on \${url} (\${engine})\`);
`;

const USERS_SERVICE = `export interface User {
    id: number;
    name: string;
}

export class UserService {
    private readonly users = new Map<number, User>([[1, { id: 1, name: "Ada" }]]);
    private nextId = 2;

    find(id: number): User | undefined {
        return this.users.get(id);
    }

    create(name: string): User {
        const user = { id: this.nextId++, name };
        this.users.set(user.id, user);
        return user;
    }
}
`;

const USERS_CONTROLLER = `import { Controller, Get, HttpError, Post, inject, t, type Ctx } from "sparkus";
import { UserService } from "./users.service.ts";

const GetUser = { params: t.object({ id: t.integer({ min: 1 }) }) };
const CreateUser = { body: t.object({ name: t.string({ min: 1, max: 100 }) }), status: 201 };

@Controller("/users")
export class UserController {
    private readonly users = inject(UserService);

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
import { controllers } from "../app.ts";
import { UserService } from "./users.service.ts";

test("GET /users/:id", async () => {
    const app = await createTestApp({ controllers });
    const res = await app.inject({ url: "/users/1" });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ id: 1, name: "Ada" });
});

test("unknown user is a 404 with a code", async () => {
    const app = await createTestApp({ controllers });
    const res = await app.inject({ url: "/users/99" });
    expect(res.status).toBe(404);
    expect(res.json().code).toBe("USER_NOT_FOUND");
});

test("POST /users validates the body", async () => {
    const app = await createTestApp({ controllers });
    expect((await app.inject({ method: "POST", url: "/users", body: { name: "Grace" } })).status).toBe(201);
    expect((await app.inject({ method: "POST", url: "/users", body: { name: "" } })).json().code).toBe("SPK2004");
});

test("a fake service replaces the real one", async () => {
    const app = await createTestApp({
        controllers,
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
| \`bunx sparkus check --json\` | After every change. Wires the app without starting it; prints the first error with its code. |
| \`bun test\` | Run the tests. |
| \`bun check\` | Type check. |
| \`bunx sparkus routes\` | List the routes. |
| \`bun run dev\` | Start with reload on save. |

## Layout

- \`src/app.ts\` lists every controller and exports the app. \`src/main.ts\` starts it.
- One feature per folder: \`src/<feature>/<feature>.controller.ts\`, \`<feature>.service.ts\`, \`<feature>.test.ts\`.
- One class per file.

## Rules

- Controllers: \`@Controller("/prefix")\`, one method per route with \`@Get\`, \`@Post\`, \`@Put\`, \`@Patch\` or \`@Delete\`. Add every controller to \`controllers\` in \`src/app.ts\`.
- Inputs are typed by schemas next to the controller: \`{ params, query, body }\` built with \`t\`. The handler takes \`ctx: Ctx<typeof Route>\`. Never parse or validate \`ctx.params\`, \`ctx.query\` or \`ctx.body\` by hand.
- Services are plain classes. Get them with \`private readonly x = inject(XService)\` in a field. Never call \`new\` on a service, never \`inject()\` inside a method.
- Errors: \`throw HttpError.notFound("...", { code: "THING_NOT_FOUND" })\` (also \`badRequest\`, \`unauthorized\`, \`forbidden\`, \`conflict\`). Clients get problem+json with your \`code\`.
- Return plain objects from handlers (sent as JSON). Set \`ctx.status\` or \`ctx.setHeader()\` when needed.
- Tests use \`createTestApp\` and \`inject()\`: no port, no server. Replace a service with \`overrides\`.

## Sparkus errors

Codes \`SPK1xxx\` stop the app at startup, \`SPK2xxx\` are request errors sent to clients. The message names the culprit and the fix. Use the fix-sparkus-error skill.
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

   \`params\` must name exactly the path's \`:parameters\`. \`query\` fields are optional with \`t.optional()\`.
3. Add the method:

   \`\`\`ts
   @Patch("/:id", UpdateUser)
   update(ctx: Ctx<typeof UpdateUser>) {
       return this.users.rename(ctx.params.id, ctx.body.name);
   }
   \`\`\`

   Business logic belongs in the service. Throw \`HttpError\` with a \`code\` for expected failures.
4. Add tests in \`<feature>.test.ts\`: the success case and each error (\`res.json().code\`).
5. Run \`bunx sparkus check --json\`, then \`bun test\`.
`;

const SKILL_SERVICE = `---
name: add-service
description: Add a service (business logic, data access) to this Sparkus app and inject it. Use when logic should move out of a controller or be shared.
---

1. Create \`src/<feature>/<feature>.service.ts\` with a plain class, no constructor arguments.
2. Dependencies come from fields: \`private readonly db = inject(Database);\`.
3. Startup work (connections, cache warm-up) goes in \`onInit()\`, cleanup in \`onShutdown()\`. Both may be async.
4. Use it from a controller with \`private readonly things = inject(ThingService);\`. Services are singletons: never \`new\` them, never list them in \`controllers\`.
5. For config values or interfaces, use a token: \`export const API_KEY = token<string>("API_KEY");\`, provided in \`createApp({ providers: [{ provide: API_KEY, useValue: ... }] })\`.
6. Run \`bunx sparkus check --json\`. A dependency cycle is \`SPK1002\`.
`;

const SKILL_TEST = `---
name: write-test
description: Write or fix tests for this Sparkus app with createTestApp and inject(). Use when asked to test an endpoint or a service.
---

\`\`\`ts
import { createTestApp } from "@sparkus/testing";
import { expect, test } from "bun:test";
import { controllers } from "../app.ts";

test("GET /things/:id", async () => {
    const app = await createTestApp({
        controllers,
        overrides: [{ provide: ThingRepository, useValue: fakeRepository }],
    });
    const res = await app.inject({ method: "GET", url: "/things/1" });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ id: 1 });
});
\`\`\`

- \`inject()\` runs the full pipeline (routing, guards, validation, errors) in memory. No port.
- Bodies: \`body: { ... }\` is sent as JSON.
- Errors are problem+json: assert \`res.status\` and \`res.json().code\`.
- Replace slow or external dependencies with \`overrides\`, never real network calls.
- Run \`bun test\`.
`;

const SKILL_ERROR = `---
name: fix-sparkus-error
description: Diagnose and fix a Sparkus error code (SPK1xxx at startup, SPK2xxx in responses). Use when sparkus check, a test or a response shows an SPK code.
---

Run \`bunx sparkus check --json\`. The message names the class, route or value at fault, then the fix.

| Code | Usual fix |
|---|---|
| SPK1001 | \`inject()\` only in a field initializer or constructor. |
| SPK1002 | Dependency cycle: move what both classes need into a third service. |
| SPK1003 | Same method and path twice: remove or rename one route. |
| SPK1004 | A class in \`controllers\` lacks \`@Controller()\`; services are never listed there. |
| SPK1006 | Use the same \`:param\` name at the same position in every path. |
| SPK1009 | A constructor threw: see \`cause\`; move I/O to \`onInit()\`. |
| SPK1013 | A \`token()\` has no provider: add it to \`providers\`. |
| SPK1014 | Invalid path: static segments and \`:name\` only. |
| SPK1017 | \`params\` must list exactly the path's parameters; schemas are flat scalars. |
| SPK2001 / SPK2002 | No route for this path / method. Check \`bunx sparkus routes\`. |
| SPK2003 / SPK2005 | Send a JSON body with \`content-type: application/json\`. |
| SPK2004 | Input does not match the schema: \`issues[0].path\` names the value. |
| SPK2007 | A guard refused the request. |
| SPK5000 | Your code threw a non-HttpError: fix it, or map it with \`onError\`. |
`;
