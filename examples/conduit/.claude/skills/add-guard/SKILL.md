---
name: add-guard
description: Protect routes with a guard (bearer token, API key, roles) and pass the authenticated user to handlers. Use when asked for auth or access control.
---

1. Create `src/auth/auth.guard.ts`:

   ```ts
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
   ```

   Return `true` to let the request through; anything else is a 403 (SPK2007). Throw an `HttpError` for a 401 or your own code.
2. Apply it: `@UseGuards(AuthGuard)` on the controller (every route) or on one method; `createApp({ guards: [AuthGuard] })` for the whole app.
3. Handlers read the user through a typed state: `create(ctx: Ctx<typeof CreateThing, { user: User }>)`, then `ctx.state.user`.
4. Secrets are tokens provided in `src/app.ts` (add-service skill).
5. Test each case: no header (401 and your code), a bad token, a good one: `inject({ url, headers: { authorization: "Bearer ..." } })`.
6. Run `bunx sparkus check --json`, then `bun test`.
