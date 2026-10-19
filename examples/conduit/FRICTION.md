# FRICTION.md: building RealWorld "Conduit" on Sparkus 1.0.0-alpha.0

Framework: commit 586fc32 (Phase 3 + controller discovery / `sparkus build`), Bun 1.4.3, Node v20.17.0, Windows 11.
Sources read: the scaffold's `AGENTS.md` and skills (regenerated with the current `sparkus init`),
`node_modules/sparkus/llms.txt`, `node_modules/sparkus/docs/errors.md`, the repo `README.md`. No framework source was
read. Each item: what I tried, what happened, cost, what would have made it simpler, and **Status** (verified on
586fc32, or new on 586fc32).

## Process

### P1. A stale build made llms.txt, dist and the types disagree, and nothing noticed

- The first pass ran on a checkout where `packages/*/src` were at Phase 2 while `packages/*/dist` and the copied
  `node_modules/sparkus/llms.txt` came from a newer build. Under Bun the package resolves to `src/` (the `"bun"`
  export condition), so the types and runtime were Phase 2 while the docs described Phase 3: `config()`,
  `inject(Logger)`, `t.enum`, schema `default`, `logger: false`, `createTestApp().fetch` and a working
  `sparkus build` were all documented and all missing. I logged six "bugs" that were this mismatch, and lost about
  45 minutes on them.
- Nothing detects it: `bun check`, `bun test` and `sparkus check` all pass on a mismatched tree. A contributor who
  pulls without rebuilding gets it silently.
- **Simpler:** stamp the build (commit hash or a sources hash) into `dist/` and llms.txt, and have `sparkus check`
  (or a workspace `postinstall`) warn when it does not match the sources. Or make the bun condition and the
  default condition resolve the same thing.
- **Status:** happened before the fast-forward to 586fc32. Everything below is re-verified on 586fc32.

## Bugs

### B1. Wrong `Ctx` on a route without a body schema is not caught by the types

- **Tried:** the neighbouring-route copy-paste mistake on purpose: `@Get("/user", Current)` with
  `ctx: Ctx<typeof Update, { user: User }>`, where `Current` has no body and `Update` has one.
- **Happened:** `✓ No type errors`. Minimal repro:
  ```ts
  const NoSchema = { response: t.object({ a: t.string() }) };
  const WithBody = { body: t.object({ user: t.object({ email: t.string() }) }), response: t.object({ a: t.string() }) };
  @Get("/b", NoSchema)
  b(ctx: Ctx<typeof WithBody>) { return { a: ctx.body.user.email }; }   // bun check: no error
  ```
  At runtime: `500 SPK5000 "undefined is not an object (evaluating 'ctx.body.user')"`. `ctx.body` is correctly
  typed `undefined` when the `Ctx` is right, so only the decorator's check misses it. llms.txt says "A handler that
  does not match (wrong return type, wrong `Ctx`) is reported by TypeScript on the decorator (TS1241)".
  When the two routes' `params` differ, it is caught (see T1).
- **Simpler:** check the handler's parameter exactly (both directions), or brand route option objects so that
  `Ctx<typeof A>` is never accepted on route B.
- **Status:** re-verified on 586fc32.

### B2. The documented fix for SPK1011 breaks with SPK1010 as soon as the service graph uses `Logger`

- **Tried:** a `SeedService` with `onInit()` that nothing injects, made to run as the SPK1011 message says:
  `app.get(SeedService)` after `createApp()` and before `listen()` (in `src/app.ts`). SeedService logs through
  `inject(Logger).child("seed")`, as AGENTS.md asks.
- **Happened:** `sparkus check --json` →
  `{"ok":false,"error":{"code":"SPK1010","message":"Provider for Logger registered after Logger was resolved. Register providers and overrides before init() or listen()."}}`.
  I never register a Logger provider: `init()` does (the stack goes through `boot` → `logger` → `provide`), and the
  early `app.get()` had already resolved Logger. It also happens when the Logger is anywhere in the graph: adding the
  template's own `private readonly log = inject(Logger).child("users")` to `UserService` (which SeedService injects)
  gives the same SPK1010. So `app.get(X)` before `init()` is a trap that fires later, when someone adds logging to
  an unrelated service. The message blames "registered after resolved" without naming the `app.get()` that caused
  it.
- **Workaround:** see G1.
- **Simpler:** register the built-in providers (Logger, config) in `createApp()` rather than in `init()`, so
  `app.get()` before init is safe; and name the early resolution in the SPK1010 message.
- **Status:** new on 586fc32.

### B3. `sparkus check` gives wrong advice for a route-less controller in discovery mode

- **Tried:** a `SeedController` with no routes, only to inject `SeedService` at startup (G1).
- **Happened:** `"warnings":["SeedController (src/seed/seed.controller.ts) has @Controller() but serves no route.
  Add it to controllers in src/app.ts, or remove the controllers option: createApp() then loads every
  *.controller.ts file."]`. The app has no `controllers` option (AGENTS.md: "never list controllers"), so both
  suggested fixes are wrong, and an agent following the first one turns discovery off.
- **Simpler:** in discovery mode say "serves no route: add a route or remove `@Controller()`".
- **Status:** new on 586fc32.

## Gaps

### G1. No way to create a service at startup unless something injects it

- **Tried:** `CONDUIT_SEED` seeding in `SeedService.onInit()`; SeedService depends on everything, nothing depends
  on it.
- **Happened:** `providers: [{ provide: SeedService, useClass: SeedService }]` → no error, `onInit` never runs.
  `createTestApp(...)` then `app.get(SeedService)` →
  `[SPK1011] SeedService has onInit() but was first resolved after startup, so it never ran. Inject it at startup, or resolve it with app.get() before listen().`
  `app.get()` before `init()` works until B2 bites, and is impossible with `createTestApp` (already initialized).
- **Workaround (kept):** `ArticleController` has an otherwise unused `private readonly seed = inject(SeedService)`
  with a comment. Controllers are built at startup, so SeedService's `onInit` runs, logging works, and the seed test
  is a plain `createTestApp({ ...options, overrides: [AppConfig.override({ CONDUIT_SEED: 1000 })] })`. A route-less
  `SeedController` also works but triggers B3's warning on every check.
- **Cost:** ~25 min over both passes.
- **Simpler:** `createApp({ startup: [SeedService] })`, or "classes listed in `providers` are created at startup".
- **Status:** re-verified on 586fc32.

### G2. 404 and 405 bypass `onError`, so error bodies are not uniform

- **Tried:** `onError` adds the RealWorld `errors` field to every HttpError (W1).
- **Happened:** SPK2003 (bad JSON), SPK2004 and SPK2005 (415) go through `onError`. SPK2001 and SPK2002 do not:
  `{"type":"about:blank","title":"Not Found","status":404,"detail":"No route matches GET /api/article.","code":"SPK2001"}`,
  `{"type":"about:blank","title":"Method Not Allowed","status":405,"detail":"/api/tags does not accept DELETE. Allowed: GET, HEAD.","code":"SPK2002"}`.
  The docs do not say which errors reach `onError`; also not documented that `onError` receives Sparkus' own
  HttpErrors at all (I found it by probing).
- **Workaround:** none; unknown routes keep the plain problem shape.
- **Simpler:** one documented hook that sees every problem response, or `onError` for all of them.
- **Status:** re-verified on 586fc32 (real server, Bun).

### G3. Validation reports only the first invalid field

- `POST /api/users` with `{"user":{"username":"a b","email":"bad","password":"x"}}` →
  `"issues":[{"path":"$.user.password","message":"must have at least 8 characters"}]` only. RealWorld clients (and
  most forms) show every field error at once. Documented ("the path of the first invalid value"), so not a bug,
  but a gap.
- **Workaround:** `errors.body` carries the single message; field-level `errors.email` etc. only for my own checks.
- **Simpler:** `validation: { allIssues: true }` (error path only), and issues that carry the field name without
  the `$.user.` prefix so mapping to `{ field: [message] }` is one line.
- **Status:** re-verified on 586fc32.

### G4. No string formats or patterns in `t`

- **Wanted:** `t.string({ format: "email" })` for registration, `format: "date-time"` for `createdAt` in OpenAPI.
- **Happened:** `TS2353: Object literal may only specify known properties, and 'format' does not exist in type
  'Bounds & Default<string>'.` (`Object.keys(t)`: string, integer, number, boolean, enum, object, array, optional,
  nullable.)
- **Workaround:** a regex in `UserService` throwing my own 422; dates are plain `t.string()` holding ISO strings (the
  docs say nothing about `Date` values in responses, so entities store strings).
- **Simpler:** `pattern` and a few `format`s (`email`, `uri`, `date-time`, `uuid`), mapped to OpenAPI.
- **Status:** re-verified on 586fc32.

### G5. OpenAPI: right shapes, but no title, no security, 200 for void handlers, no `$ref` reuse

- **Good:** list items omit `body` (the list schema has none), `t.nullable` → `"type": ["string", "null"]`, query
  defaults appear (`"limit": { ..., "default": 20 }`), 201 on create routes, `/health` and `/ready` left out, a
  shared `Problem` schema.
- **Missing or wrong:**
  - `info` is `{ "title": "API", "version": "1.0.0" }`; `sparkus openapi` has no flag for it and does not read
    `package.json`. The generated client's header says "from the route schemas of API" too.
  - No `securitySchemes`, no `security` on guarded routes, no 401/403 responses: nothing tells that
    `POST /api/articles` needs a token and `GET /api/articles` takes one optionally.
  - A handler returning `undefined` answers 204 but is documented `200 OK` unless the route declares `status: 204`
    (I added it to both DELETE routes; then OpenAPI says 204 and the client returns `Promise<undefined>`).
  - `Profile` is inlined in every profile, article and comment schema (about a dozen copies, 19.7 KB for 19 routes);
    no way to name a schema for `components.schemas`.
  - No `summary`/`tags` per route; operationIds are `ArticleController.list`.
- **Simpler:** guards declare a security scheme, `status` inferred as 204 for `void` handlers, title/version from
  `package.json`, a `name` on `t.object`.
- **Status:** re-verified on 586fc32.

## Docs

### D1. The fresh `sparkus init` template contradicts itself and llms.txt in a few places

Compared against a project generated by the current `sparkus init` (outside the repo):
- `add-guard` skill step 4: "Secrets are tokens provided in `src/app.ts` (add-service skill)". AGENTS.md says
  configuration lives in `src/config.ts` and "never read `process.env` elsewhere", and the add-service skill says
  `config()`. A JWT secret is exactly the case: I followed AGENTS.md.
- `fix-sparkus-error` skill: SPK1004 row "A class in `controllers` lacks `@Controller()`; services are never listed
  there" and SPK1013 row "tests pass `providers` to `createTestApp`" still describe listed controllers and bare
  providers, while the template never lists controllers and tests use `createTestApp({ ...options, overrides })`.
- `src/config.ts` calls `config({ ... }, { name: "AppConfig" })`: the second argument is not in llms.txt.
- `add-guard` covers only required `Bearer` auth; nothing on optional auth (E2).
- llms.txt's Testing example is `createTestApp({ providers, overrides })`; the template (rightly) uses
  `createTestApp({ ...options, overrides })`. Both work, but the one-page reference shows the weaker form first.
- **Status:** new on 586fc32 (template regenerated from the current CLI).

### D2. Useful exports are undocumented: `Infer`, `TestApp`, `Schema`

- I needed a TypeScript type from a `t` schema to avoid writing shapes twice. llms.txt never mentions one, and `t`
  schemas carry no `~standard` property. Guessing `import type { X } from "sparkus"`: `Infer` and `Schema` exist
  (`Static`, `InferSchema`, `TypeOf` do not). `Infer<typeof S>` is right (`string | null` for nullable, `c?: number`
  for optional). `@sparkus/testing` exports `TestApp` (I first wrote `Awaited<ReturnType<typeof createTestApp>>`).
- **Cost:** ~10 min of guessing. An agent without autocomplete would write interfaces.
- **Simpler:** `type User = Infer<typeof User>` in the Schemas section; `TestApp` in Testing.
- **Status:** re-verified on 586fc32 (`grep Infer\|TestApp llms.txt`: no match).

### D3. "Did you mean ...?" depends on NODE_ENV in a way the docs do not make clear

- Under `NODE_ENV=test` a 404 says `No route matches GET /api/article. Did you mean GET /api/articles?`. Running
  `bun src/main.ts` with NODE_ENV unset gives no suggestion, although errors.md says "In development and test" and
  an unset NODE_ENV usually means development.
- **Status:** re-verified on 586fc32.

## Type errors

### T1. Response mismatch: the answer is on the last line, under four lines of noise

Handler returns `{ user: { email } }` where the response needs `token`:

```
error TS1241: Unable to resolve signature of method decorator when called as an expression.
  Argument of type '(ctx: Ctx<{ response: Schema<{ user: { email: string; token: string; }; }, false>; }, Record<string, unknown>>) => { user: { email: string; }; }' is not assignable to parameter of type '(this: WController, ctx: Ctx<{ response: Schema<{ user: { email: string; token: string; }; }, false>; }, any>) => Promise<{ user: { email: string; token: string; }; }> | Response | { ...; }'.
    Type '{ user: { email: string; }; }' is not assignable to type 'Promise<{ user: { email: string; token: string; }; }> | Response | { user: { email: string; token: string; }; }'.
      Type '{ user: { email: string; }; }' is not assignable to type '{ user: { email: string; token: string; }; }'.
        Types of property 'user' are incompatible.
          Property 'token' is missing in type '{ email: string; }' but required in type '{ email: string; token: string; }'.
related: 'token' is declared here.
```

As llms.txt promises, the last line and the `related` location name the problem. The first line says nothing
useful, and the error sits on the decorator, not on the `return`. Readable once you know to read from the bottom.

When a wrong `Ctx` has different `params`, it is caught the same way, ending in
`Property 'id' is incompatible with index signature. Type 'number' is not assignable to type 'string'.`: correct,
but it never says "this Ctx belongs to another route". (When the params match and only the body differs, see B1.)

Missing prefix parameter, for comparison, is excellent at startup:
`SPK1017 DELETE /api/articles/:slug/comments/:id (CommentController.remove): params schema has fields id but the path has :slug, :id. Use the same names in both.`

- **Status:** re-verified on 586fc32.

## Ergonomics

### E1. Boilerplate counted

| Repeated thing | Count | Note |
|---|---|---|
| `@UseGuards(AuthGuard)` / `@UseGuards(OptionalAuthGuard)` | 16 of 19 routes | Required and optional auth are mixed in each controller, so a controller-level guard does not fit. |
| `ctx: Ctx<typeof X, { user: User }>` / `{ user?: User }` | 16 | Repeats what the guard knows, unchecked (E2). |
| `params: t.object({ slug: ... })` in the comments controller | 3 | The prefix `/api/articles/:slug/comments` has `:slug`, so every route redeclares it. A controller-level `params` would remove it. |
| `{ article: this.articles.view(x, ctx.state.user) }` and the like | 10 | RealWorld envelope + viewer-dependent view. |
| Manual view builders (`ArticleService.view` 13 lines, `CommentService.view` 8, `ProfileService.view` 3) | 3 | AGENTS.md: "return entities as they are; do not copy fields by hand". Computed fields (`favorited`, `favoritesCount`, `following`, nested `author`) need a new object anyway, which the `response` schema then copies again to filter it. No documented pattern for computed fields. |
| Route option `const`s | 17 | One per route, as documented; they read well. |

Controllers are no longer listed anywhere (discovery), which removed the `controllers` array from `src/app.ts`.
- **Status:** re-verified on 586fc32.

### E2. Optional auth works, by convention only

- Two guards: `AuthGuard` (401 without a valid token) and `OptionalAuthGuard` (always `true`; sets
  `ctx.state.user` for a valid token; 401 for a present-but-invalid one), sharing `AuthService.authenticate()`.
  About 15 lines, clean.
- The state type is not tied to the guard: `Ctx<typeof R, { user: User }>` on an `OptionalAuthGuard` route compiles
  and is `undefined` at runtime. No recipe in the docs or skills.
- **Simpler:** `Guard<{ user: User }>` that declares what it adds, and a `Ctx` derived from the route's guards; at
  least an optional-auth recipe in the add-guard skill.
- **Status:** re-verified on 586fc32.

### E3. `sparkus routes` does not name the guards

- `GET /api/articles  ArticleController.list  (1 guard(s))` for `OptionalAuthGuard` and `AuthGuard` alike, so I
  cannot use it to check which routes require auth. `(AuthGuard)` would do it.
- **Status:** re-verified on 586fc32.

### E4. Same shape written twice

- **Avoided with `Infer`:** `UserChanges`, `NewArticle`, `ArticleChanges`, `ArticleQuery`, `ArticleView`,
  `CommentView`, `Profile`.
- **Still twice:** the stored entities (`User`, `Article`, `Comment`, 30 lines) repeat about 17 public fields of the
  response schemas, because entities hold private fields (`passwordHash`, `salt`, `authorId`, `favoritedBy`) no
  schema lists. Deriving them with `Omit<Infer<...>>` is possible but reads worse than the duplication.
- Pagination defaults now live once, in the schema (`t.integer({ min: 1, max: 100, default: 20 })`).
- **Status:** re-verified on 586fc32.

### E5. Environment: a background `bun src/main.ts` outlives its stopped shell on Windows

- Not Sparkus' fault: stopping the background shell left the Bun child holding port 3999 (both passes). Check the
  port after stopping a load test.
- **Status:** re-verified on 586fc32.

## What worked well

- **`onError` → RealWorld errors** (W1): one 15-line function turns SPK2004 into a 422 and adds `errors` to every
  HttpError, for body *and* query errors (an app interceptor would only see body errors: params/query are converted
  before interceptors). Re-verified.
- **`config()`**: `JWT_SECRET` and `CONDUIT_SEED` are typed, defaulted and checked at startup;
  `AppConfig.override({ CONDUIT_SEED: 1000 })` in a test is exactly what I wanted. Replaced a hand-written
  `seedCount()` parser and two tokens.
- **Schema `default`**: `ctx.query.limit` is a `number`, and OpenAPI shows the default.
- **`response` schemas**: password hashes, salts, author ids and the `favoritedBy` set never leave; a test greps every
  response body. Lists drop `body` just by having a schema without it. Unknown body fields (`role: "admin"`) are
  dropped (tested).
- **`t.optional(t.nullable(...))`** for `bio`/`image` in `PUT /api/user`: absent = unchanged, `null` = clear.
- **Controller discovery**: no list to maintain; `createTestApp(options)` finds them too.
- **`sparkus build --target node`**: `✓ dist/main.js: bundled for node, 5 controller files imported.`; the bundle ran
  on Node v20.17.0 with `CONDUIT_SEED=100`: login, list, get, create, tags, `/health`, `/ready` all fine.
- **Production options from the template** (`logger: { requests: true }`, `securityHeaders`, `requestId`, `health`,
  `requestTimeout`): one line each; Bun and Node now log the same `Listening on ...` line and the same request lines.
- **Generated client**: one readable file, typed from response schemas, `headers` may be a function (token changes
  after login), errors are `ApiError` with `status`/`code`/`problem`; wired with `fetch: (r) => app.fetch(r)` exactly
  as llms.txt says.
- The whole app type-checked on the first `bun check`; handlers may return wider objects than the response schema
  (one view builder, two projections).
- Static segments beat parameters (`/api/articles/feed` vs `/:slug`) with no effort; `t.enum` with `default` types
  `ctx.query.sort` as `"asc" | "desc"` (probed; RealWorld has no enum field to use it on).
- Seeding 1000 articles + 3000 comments: ~20-30 ms (`{"module":"seed","msg":"Seeded","articles":100,"ms":19}` for
  100; the test asserts 1000 under 1 s).

## Numbers (586fc32)

Non-blank lines in `src/`, without tests and the generated client:

| Part | Lines |
|---|---|
| Schemas (`*.schemas.ts`, 4 files) | 95 |
| Controllers (5 files, incl. ~20 lines of route option consts) | 190 |
| Services (users, profiles, articles, comments, auth, seed) | 409 |
| Guards, password, errors, config, app, main | 100 |
| Entity interfaces | 30 |
| **Total** | **824** |
| Tests (7 files + helper) | 502 |
| Generated client | 349 |

Schema vs logic: ~115 lines of schema against ~510 of logic and ~170 of controller glue.

## Top 10, ranked by impact on a new user (586fc32)

1. **B1: a wrong `Ctx` on a route without a body type-checks and crashes at runtime**, contrary to llms.txt. The
   most common copy-paste mistake for agents.
2. **P1: nothing detects a stale build** (dist/llms.txt vs sources). It cost the whole first pass six phantom bugs.
3. **B2 + G1: services nobody injects never start, and the documented `app.get()` workaround breaks with SPK1010**
   once anything in the graph uses `Logger`; the real workaround is an unused injection in a controller.
4. **G3: one validation issue per response**: form-style clients (RealWorld) need all field errors.
5. **E2 + E3 + G5 (security): guards are invisible** to the types (`ctx.state` unchecked), to OpenAPI (no
   security) and to `sparkus routes` ("1 guard(s)"); optional auth has no recipe.
6. **G2: 404/405 bypass `onError`**, so an app cannot give all errors one shape; which errors reach it is
   undocumented.
7. **D2: `Infer` and `TestApp` are undocumented**; without `Infer` every response shape is written twice.
8. **D1: the fresh template contradicts itself** (add-guard says secrets are tokens; fix-sparkus-error rows assume
   listed controllers) and uses an undocumented `config(..., { name })`.
9. **B3: `sparkus check` tells a discovery-mode app to "add it to controllers"**, which would turn discovery off.
10. **G4 + G5: no string formats; OpenAPI title "API", 200 for void handlers, `Profile` inlined everywhere.**
