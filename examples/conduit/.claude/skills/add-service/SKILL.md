---
name: add-service
description: Add a service (business logic, data access) to this Sparkus app and inject it. Use when logic should move out of a controller or be shared.
---

1. Create `src/<feature>/<feature>.service.ts` with a plain class, no constructor parameters (Sparkus calls `new X()`).
2. Dependencies come from fields: `private readonly db = inject(Database);`.
3. Startup work (connections, cache warm-up) goes in `onInit()`, cleanup in `onShutdown()`. Both may be async.
4. Use it from a controller with `private readonly things = inject(ThingService);`. Services are singletons: never `new` them.
5. Configuration: add the variable to `config({ ... })` in `src/config.ts` (`API_KEY: t.string({ min: 1 })`) and to `.env.example`, then `private readonly config = inject(AppConfig)`. For an interface implemented by several classes, use a token: `export const MAILER = token<Mailer>("MAILER")`, provided in `providers` in `src/app.ts`.
6. Log with `private readonly log = inject(Logger).child("<feature>")`. A service wrapping a database or remote server implements `HealthCheck`: `checkHealth()` throws when it cannot serve, and `/ready` reports it.
7. Run `bunx sparkus check --json`. A dependency cycle is `SPK1002`.
