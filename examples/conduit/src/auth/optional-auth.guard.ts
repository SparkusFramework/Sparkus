import { inject, type Ctx, type Guard } from "sparkus";
import { AuthService } from "./auth.service.ts";

// Optional auth: anonymous requests pass with no `ctx.state.user`; a header that is present but invalid is still a
// 401 (a client sending a stale token should learn it). Handlers type the state as `{ user?: User }`.
export class OptionalAuthGuard implements Guard {
    private readonly auth = inject(AuthService);

    canActivate(ctx: Ctx) {
        const user = this.auth.authenticate(ctx.header("authorization"));
        if (user !== undefined) ctx.state.user = user;
        return true;
    }
}
