import { HttpError, inject, type Ctx, type Guard } from "sparkus";
import { AuthService } from "./auth.service.ts";

// Required auth: 401 without a valid token. Handlers type the state as `{ user: User }`.
export class AuthGuard implements Guard {
    private readonly auth = inject(AuthService);

    canActivate(ctx: Ctx) {
        const user = this.auth.authenticate(ctx.header("authorization"));
        if (user === undefined) throw HttpError.unauthorized("Authentication required.", { code: "AUTH_REQUIRED" });
        ctx.state.user = user;
        return true;
    }
}
