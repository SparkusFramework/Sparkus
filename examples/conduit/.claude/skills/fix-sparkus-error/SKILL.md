---
name: fix-sparkus-error
description: Diagnose and fix a Sparkus error code (SPK1xxx at startup, SPK2xxx in responses). Use when sparkus check, a test or a response shows an SPK code.
---

Run `bunx sparkus check --json`. The message names the class, route or value at fault, then the fix. A route that answers 404: its controller is not exported from a `*.controller.ts` file under `src/`. Every code: `node_modules/sparkus/docs/errors.md`.

| Code | Usual fix |
|---|---|
| SPK1001 | `inject()` only in a field initializer or constructor. |
| SPK1002 | Dependency cycle: move what both classes need into a third service. |
| SPK1003 | Same method and path twice: remove or rename one route. |
| SPK1004 | A class in `controllers` lacks `@Controller()`; services are never listed there. |
| SPK1020 | No `*.controller.ts` file under `src/`, or one that exports no `@Controller()` class, or fails to load (see `cause`). |
| SPK1006 | Use the same `:param` name at the same position in every path. |
| SPK1009 | A constructor threw (see `cause`; move I/O to `onInit()`), or has parameters: use `inject()` in fields. |
| SPK1013 | A `token()` has no provider: add it to `providers` in `src/app.ts`; tests pass `providers` to `createTestApp`. |
| SPK1016 | An `onInit()` threw: see `cause`. |
| SPK1014 | Invalid path: static segments and `:name` only. |
| SPK1017 | `params` must list exactly the path's parameters; schemas are flat scalars; a `default` must pass its own schema. |
| SPK1018 | A variable of `src/config.ts` (or PORT, or LOG_LEVEL) is missing or invalid (all are listed): set it in `.env`, or give it a `default`. |
| SPK1019 | An app option is invalid (CORS origin with a trailing slash, `origin: "*"` with credentials): follow the message. |
| SPK2001 / SPK2002 | No route for this path / method. Check `bunx sparkus routes`. |
| SPK2003 / SPK2005 | Send a JSON body with `content-type: application/json`. |
| SPK2004 | Input does not match the schema: `issues[0].path` names the value. |
| SPK2007 | A guard returned something other than `true`. Throw `HttpError.unauthorized(..., { code })` for a 401. |
| SPK2008 | The request took longer than `requestTimeout`: speed it up, or give the route its own `timeout`. |
| SPK2009 | `/ready` failed: a `HealthCheck` service threw, returned `false` or timed out (`checks` names it), or the app is shutting down. |
| SPK5000 | Your code threw a non-HttpError: fix it, or map it with `onError`. |
