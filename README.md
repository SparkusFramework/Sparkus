<div align="center">
    <img src="./.github/banner.svg" width="400px">
    <h1>Sparkus ✨</h1>
    <p><strong>The fastest decorator + dependency injection backend framework for TypeScript.</strong><br>
    Runs on Bun and Node. Zero runtime dependencies. Built to be written by humans and AI agents.</p>
</div>

> **Status: v1 in development (alpha).** The API may still change. See [ROADMAP.md](./ROADMAP.md).

```ts
import { Controller, Get, Post, HttpError, createApp, inject, t, type Ctx } from "sparkus";

class UserService {
    find(id: string) {
        return id === "42" ? { id, name: "Ada" } : undefined;
    }
}

const CreateUser = {
    body: t.object({ name: t.string({ min: 1 }), age: t.integer({ min: 0 }) }),
    status: 201,
};

@Controller("/users")
class UserController {
    private readonly users = inject(UserService);

    @Get("/:id")
    get(ctx: Ctx) {
        const user = this.users.find(ctx.params.id!);
        if (user === undefined) throw HttpError.notFound(`User ${ctx.params.id} not found.`);
        return user;
    }

    @Post("", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        return { id: 1, ...ctx.body }; // ctx.body is typed { name: string; age: number }, already validated
    }
}

await createApp({ controllers: [UserController] }).listen({ port: 3000 });
```

## Why Sparkus

- **Fast by construction.** Everything that can be decided at startup is: dependencies are resolved once, validators are compiled to plain functions, and each route's pipeline (guards, interceptors, validation) is composed ahead of time. A route without guards runs its handler directly. On Bun, routes go to `Bun.serve`'s native router.
- **One app, two runtimes.** `createApp` picks `Bun.serve` under Bun and `node:http` under Node. One conformance suite runs on both: the engine never changes your app's behavior.
- **Standard TypeScript.** TC39 decorators, no `experimentalDecorators`, no `reflect-metadata`. Dependencies come from `inject(Service)`: typed, no string tokens.
- **Errors anyone can act on.** HTTP errors are `application/problem+json` (RFC 9457) with stable codes. Startup errors (`SPK1xxx`) say what is wrong and how to fix it: dependency cycles show their full path, duplicate routes name both handlers.
- **Production basics built in.** Lifecycle hooks (`onInit`, `onShutdown`), graceful shutdown on SIGTERM with connection draining, body limits, no stack traces in responses.
- **Zero runtime dependencies**, checked in CI.

## Packages

| Package | What it is |
|---|---|
| `sparkus` | What you install: the core plus both engines, picked automatically. |
| `@sparkus/core` | Decorators, DI container, router, compiled pipeline, errors, `app.fetch`. |
| `@sparkus/engine-bun` | Engine on `Bun.serve` native routes. |
| `@sparkus/engine-node` | Engine on `node:http`. |
| `@sparkus/testing` | `createTestApp()` with overrides and in-memory `inject()`. |
| `@sparkus/cli` | The `sparkus` command (early). |

## Command line

```bash
bunx @sparkus/cli init my-api
```

Creates a project ready for humans and agents: an example feature with its tests, `AGENTS.md` (conventions), `CLAUDE.md`, skills in `.claude/skills/` (add an endpoint, add a service, write a test, fix an `SPK` error) and a hook that runs `sparkus check --json` after every edit.

| Command | What it does |
|---|---|
| `sparkus dev [entry]` | Runs the app and restarts it on every change under `src/` (our own watcher, JSON events with `--json`). |
| `sparkus check [entry]` | Wires the app (DI, routes, schemas) without listening; prints the first error with its code. |
| `sparkus routes [entry]` | Lists the routes. |

## Testing an app

```ts
import { createTestApp } from "@sparkus/testing";

const app = await createTestApp({
    controllers: [UserController],
    overrides: [{ provide: UserService, useValue: { find: () => ({ id: "1", name: "Fake" }) } }],
});
const res = await app.inject({ url: "/users/1" });
// res.status === 200, res.json() === { id: "1", name: "Fake" }
```

## Developing Sparkus

```bash
bun install
```

```bash
bun run test
```

`bun run test` builds every package with `bun build`, then runs unit tests and the conformance suite on four targets (in memory, Bun engine, Node engine under Bun, a real Node process; set `NODE_BIN` to pick the Node binary). `bun run typecheck` checks sources and tests with `bun check`, `bun run check:deps` enforces zero runtime dependencies, and `bun run bench` runs the [benchmark](./bench/README.md).

## License

MIT
