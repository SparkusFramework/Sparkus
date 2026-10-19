---
name: add-endpoint
description: Add an HTTP endpoint to this Sparkus app (route, typed inputs, test). Use when asked to add or change an API route.
---

1. Find the feature folder in `src/<feature>/`, or create one (controller, service, test). A new controller goes in `src/<feature>/<feature>.controller.ts` (exported): it is found at startup.
2. Declare the inputs next to the controller, with `t` from "sparkus":

   ```ts
   const UpdateUser = {
       params: t.object({ id: t.integer({ min: 1 }) }),
       body: t.object({ name: t.string({ min: 1 }) }),
   };
   ```

   `params` must name exactly the path's `:parameters`. `query` fields take a `default` (always present then) or `t.optional()`:

   ```ts
   const ListUsers = { query: t.object({ page: t.integer({ min: 1, default: 1 }), sort: t.enum(["asc", "desc"], { default: "asc" }) }) };
   // in the handler: ctx.query.page is a number, ctx.query.sort is "asc" | "desc"
   ```

   Route options are `params`, `query`, `body`, `response`, `status`, `timeout` (ms) and `bodyLimit` (bytes); any other key is SPK1017.
3. Add the method:

   ```ts
   @Patch("/:id", UpdateUser)
   update(ctx: Ctx<typeof UpdateUser>) {
       return this.users.rename(ctx.params.id, ctx.body.name);
   }
   ```

   Business logic belongs in the service. Throw `HttpError` with a `code` for expected failures.
   `ctx.body` holds only the fields `UpdateUser.body` lists: pass it whole or field by field.
   Behind a guard that sets `ctx.state.user`, type it: `ctx: Ctx<typeof UpdateUser, { user: User }>`.
4. Add tests in `<feature>.test.ts`: the success case and each error (`res.json().code`).
5. Run `bunx sparkus check --json`, then `bun test`.
