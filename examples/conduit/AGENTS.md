# conduit

A Sparkus backend (TypeScript, Bun). Read this before changing code.

## Commands

| Command | Use |
|---|---|
| `bunx sparkus check --json` | After every change. Wires the app without starting it; prints the first error with its code. |
| `bun test` | Run the tests. |
| `bun check` | Type check. |
| `bunx sparkus routes` | List the routes. |
| `bun run dev` | Start with reload on save. |
| `bun run build` | Bundle for production into `dist/` (controllers found at build time); run `bun dist/main.js`. |

## Layout

- `src/app.ts` exports `options` (providers, the production options) and the app. `src/main.ts` starts it. `src/config.ts` declares every environment variable.
- One feature per folder: `src/<feature>/<feature>.controller.ts`, `<feature>.service.ts`, `<feature>.test.ts`. Every `*.controller.ts` file under `src/` is loaded at startup: never list controllers.
- One class per file.

## Rules

- Controllers: `@Controller("/prefix")`, one method per route with `@Get`, `@Post`, `@Put`, `@Patch` or `@Delete`, in a file named `<feature>.controller.ts` that exports the class.
- Inputs are typed by schemas next to the controller: `{ params, query, body }` built with `t`. The handler takes `ctx: Ctx<typeof Route>`. Never parse or validate `ctx.params`, `ctx.query` or `ctx.body` by hand.
- `ctx.body` holds only the fields its schema lists (unknown ones are dropped), so a client cannot sneak in an `id` or a `role`.
- Declare a `response` schema on routes that return records: only its fields are sent, so internal fields (password hashes, foreign keys) never leak. Return entities as they are; do not copy fields by hand.
- Services are plain classes. Get them with `private readonly x = inject(XService)` in a field. Never constructor parameters, never `new` on a service, never `inject()` inside a method. Startup work goes in `onInit()`.
- Configuration comes from environment variables declared in `src/config.ts` (`config({ NAME: t.string(), ... })`, with a `default` or `t.optional()` for optional ones, never both), read with `inject(AppConfig)`. Never read `process.env` elsewhere. Add new variables to `.env.example`. Tests change values with `overrides: [AppConfig.override({ NAME: value })]`.
- Logging: `private readonly log = inject(Logger).child("feature")` in services, `ctx.log` in handlers (adds the request id). `log.info("What happened", { ids })`, `log.error("What failed", error)`. Never `console.log`.
- A service that talks to a database or another server implements `HealthCheck` (`checkHealth()` throws when it cannot serve): `/ready` calls it. Pass `ctx.signal` to `fetch()` and database calls so they stop with the request.
- Auth is a guard class (add-guard skill). It stores the user in `ctx.state`; handlers type it: `ctx: Ctx<typeof Route, { user: User }>`.
- Errors: `throw HttpError.notFound("...", { code: "THING_NOT_FOUND" })` (also `badRequest`, `unauthorized`, `forbidden`, `conflict`). Clients get problem+json with your `code`.
- Return plain objects from handlers (sent as JSON). Set `ctx.status` or `ctx.setHeader()` when needed.
- Tests use `createTestApp({ ...options, overrides })` and `inject()`: no port, no server, the same app as production. Replace a service with `overrides`.

## Sparkus errors

Codes `SPK1xxx` stop the app at startup, `SPK2xxx` are request errors sent to clients. The message names the culprit and the fix. Use the fix-sparkus-error skill.

## Reference

- `node_modules/sparkus/llms.txt`: the whole API on one page (routes, schemas, ctx, DI, guards, errors, testing, CLI).
- `node_modules/sparkus/docs/errors.md`: every error code, its cause and its fix.
