# Sparkus error codes

Every error Sparkus raises carries a stable code. Messages follow one shape:

```
[SPK1002] Dependency cycle: A -> B -> A. Move what both need into a third service.
```

The code, then what is wrong (naming the class, route or value at fault), then the fix. Search this page for the code to read more.

- **SPK1xxx: startup.** Thrown by `init()` or `listen()`. The app does not start.
- **SPK2xxx: request.** Sent to the client as `application/problem+json` (RFC 9457) with `code` in the body.
- **SPK5xxx: internal.** An unexpected error in your code. Logged; the client gets a 500 without details in production.

## Startup

| Code | Meaning | Fix |
|---|---|---|
| SPK1001 | `inject()` called outside a construction managed by Sparkus. | Call `inject()` in a field initializer or constructor of a controller, service, guard or interceptor. Never at module level or inside a method. |
| SPK1002 | Dependency cycle. The message shows the cycle and the path that reached it. | Move the logic both classes need into a third service that neither depends on. |
| SPK1003 | The same method and path are declared twice (the message names both handlers), or a controller is listed twice in `controllers`, or a route takes the path of a health probe (`/health`, `/ready` with `health: true`). | Remove one, or change its path or method; move the probes with `health: { path, readyPath }`. |
| SPK1004 | A class in `controllers` has no `@Controller()`. | Add `@Controller("/prefix")`, or remove it from `controllers` (services are never listed: they are created by `inject()`). |
| SPK1005 | A route decorator is on a static or private method. | Route handlers are public instance methods. |
| SPK1006 | Two routes use different parameter names at the same position (`/users/:id` and `/users/:userId/posts`). | Use the same name at the same position. |
| SPK1007 | No HTTP engine is available, or the Bun engine was requested outside Bun. | Import `createApp` from `sparkus` (it picks Bun or Node), or pass `engine: "node"`. |
| SPK1008 | A guard or interceptor is neither a function nor a class with `canActivate()` / `intercept()`. | Pass `(ctx) => boolean`, `(ctx, next) => unknown`, or a class implementing `Guard` / `Interceptor`. |
| SPK1009 | A constructor threw, or declares parameters (`constructor(private users: UserService)`: Sparkus calls `new X()` without arguments). The message shows the dependency path and the original error (`cause`). | Fix the constructor. Move I/O (connections, file reads) to `onInit()`. Declare dependencies as fields: `private readonly users = inject(UserService)`. |
| SPK1010 | A provider was registered after its token was already resolved. | Register providers and test overrides before `init()` / `listen()`. |
| SPK1011 | A class with `onInit()` was first resolved after startup, so its hook would never run. | Inject it somewhere at startup, or resolve it with `app.get()` before `listen()`. |
| SPK1012 | `app.fetch()` or `app.routes` used before the app is initialized. | `await app.init()` first. |
| SPK1013 | A `token()` has no factory and no provider. The message names the classes that needed it. | Add `{ provide: TOKEN, useValue: ... }` to `providers`, in `createApp()` and in `createTestApp()`, or give the token a default factory: `token("TOKEN", () => ...)`. |
| SPK1014 | Invalid route path: empty segment, bad parameter name, repeated parameter, or unsupported syntax (`*`, `?`, `(`). | Use static segments and `:name` parameters (letters, digits, `_`, `$`). |
| SPK1015 | `listen()` called twice on the same app. | Create one app per server. |
| SPK1016 | An `onInit()` or `onShutdown()` hook failed. | See `cause`. A failing `onInit()` stops startup; failing `onShutdown()` hooks are reported together after all of them ran. |
| SPK1017 | A route's schema is invalid. `params` or `query`: not a `t.object()`, a field that is not a string, integer, number, boolean or enum, or `params` that do not match the path's parameters exactly (missing, extra, or optional), or a `t.nullable()` field (parameters are strings, never null), or a path parameter with a `default`; the message lists the schema's fields and the path's parameters side by side. `body` or `response`: a field named `__proto__`. Any `t` schema: a `default` that fails its own schema (`t.integer({ min: 1, default: 0 })`), a `default` inside `t.optional()` (a default makes the field always present), or `t.enum([])` without values. Route options: an unknown key (`{ requestTimeout }` on a route: the route option is `timeout`), with the closest name suggested. Any of them: an object with a `~standard` property that is not a Standard Schema v1 (no `validate()`). | Declare exactly the path's parameters in `params`, all required; use flat scalar fields. Rename a `__proto__` field. Use a `t` schema or a library implementing Standard Schema v1. |
| SPK1018 | Invalid configuration. `config()`: a variable is missing or invalid when the app starts (the message lists every one, never the values); a schema field environment variables cannot fill (an object, a nullable, a default inside `t.optional()`) is reported as soon as `config()` runs, when its module is imported. `LOG_LEVEL`: a value that is not a level. `PORT`: not an integer from 0 to 65535. | Set the variables (shell, `.env`, deployment settings), or change the `config()` schema: `t.optional()` or a `default` for optional ones. `LOG_LEVEL` takes trace, debug, info, warn, error, fatal or silent, with module levels: `info,db=debug`. |
| SPK1019 | Invalid app option: a CORS origin with a path or a trailing slash (it never matches the `Origin` header), `origin: "*"` with `credentials: true`, a `cors.maxAge` that is not an integer >= 0, a logger level that does not exist (`level` or `modules`), a negative or fractional `requestTimeout`, `bodyLimit`, route `timeout`, `shutdownTimeout`, `shutdownDelay` or `idleTimeout`, a `health.timeout` that is not > 0. | Follow the message: `"https://app.example.com"` without a slash, list the origins when sending credentials, integers >= 0. |
| SPK1020 | Controller discovery failed (`createApp()` without a `controllers` list): no `*.controller.ts` file in the source folder (the top folder of the package holding the file calling `createApp()`, usually `src/`), a `*.controller.ts` file that exports no `@Controller()` class, a file that fails to load (see `cause`), a `controllers: "folder"` that does not exist, or a runtime that cannot tell which file called `createApp()`. | Name controller files `<feature>.controller.ts` under `src/` and export the class. Tests outside `src/` (a top-level `test/` folder) point to it: `createTestApp({ controllers: "../src" })`. A bundle has no controller files: build it with `sparkus build` (or `sparkusPlugin()` from `sparkus/build` in `Bun.build`), which finds them at build time; a bundle built so rejects `controllers: "folder"`. |

## Request

| Code | Status | Meaning |
|---|---|---|
| SPK2001 | 404 | No route matches the method and path. Paths are case-sensitive and a trailing slash is a different path. In development and test, the detail suggests the closest route: `Did you mean GET /users/:id?` |
| SPK2002 | 405 | The path exists, but not for this method. The `Allow` header lists the accepted methods. |
| SPK2003 | 400 | The body is empty or not valid JSON. |
| SPK2004 | 400 | The body does not match the route's schema. `issues` gives the path of the first invalid value (`$.age`) and what was expected. Fields the schema does not list are not an error: they are dropped. |
| SPK2005 | 415 | The route expects JSON but the request's `content-type` is something else, or missing. |
| SPK2006 | 413 | The body is larger than `bodyLimit` (1 MiB by default). |
| SPK2007 | 403 | A guard returned something other than `true`. Guards can also throw their own `HttpError` (for example a 401 with your own code). |
| SPK2008 | 503 | The request took longer than its timeout (`requestTimeout`, or the route's `timeout`). The client got this answer, `ctx.signal` was aborted (also when read after the timeout), and whatever the handler returns later is dropped. Only asynchronous work can time out: a synchronous handler is never interrupted. Raise the timeout of slow routes, or make them faster. |
| SPK2009 | 503 | Readiness (`/ready`) failed: a `HealthCheck` service threw or returned `false` (`checks` names it; the error message appears only when `exposeErrors` is on), or the app is shutting down. |

## Internal

| Code | Status | Meaning |
|---|---|---|
| SPK5000 | 500 | Your code threw something that is not an `HttpError`. The error is logged with the method and path. Its message is sent only when `exposeErrors` is on (by default in `development` and `test`); the stack is never sent. Map known errors to HTTP errors with `onError`. |
| SPK5001 | 500 | The handler's value does not have the shape of the route's `response` schema: an object or array is missing, or is something else (`$.roles must be an array, got string`). Usually a cast (`as any`) hid it from the compiler. Logged like SPK5000; the message names the route and the path. |

## Your own errors

Throw `HttpError` with your own code. It is sent as problem+json, as is:

```ts
throw HttpError.notFound(`User ${id} not found.`, { code: "USER_NOT_FOUND" });
```

```json
{ "type": "about:blank", "title": "Not Found", "status": 404, "detail": "User 42 not found.", "code": "USER_NOT_FOUND" }
```
