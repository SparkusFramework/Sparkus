import { Controller, Delete, Get, Post, UseGuards, inject, t, type Ctx } from "sparkus";
import { AuthGuard } from "../auth/auth.guard.ts";
import { OptionalAuthGuard } from "../auth/optional-auth.guard.ts";
import type { User } from "../users/user.ts";
import { ProfileResponse } from "./profiles.schemas.ts";
import { ProfileService } from "./profiles.service.ts";

const ByUsername = { params: t.object({ username: t.string({ min: 1 }) }), response: ProfileResponse };

@Controller("/api/profiles")
export class ProfileController {
    private readonly profiles = inject(ProfileService);

    @Get("/:username", ByUsername)
    @UseGuards(OptionalAuthGuard)
    get(ctx: Ctx<typeof ByUsername, { user?: User }>) {
        const user = this.profiles.get(ctx.params.username);
        return { profile: this.profiles.view(user, ctx.state.user) };
    }

    @Post("/:username/follow", ByUsername)
    @UseGuards(AuthGuard)
    follow(ctx: Ctx<typeof ByUsername, { user: User }>) {
        const user = this.profiles.get(ctx.params.username);
        this.profiles.follow(ctx.state.user, user);
        return { profile: this.profiles.view(user, ctx.state.user) };
    }

    @Delete("/:username/follow", ByUsername)
    @UseGuards(AuthGuard)
    unfollow(ctx: Ctx<typeof ByUsername, { user: User }>) {
        const user = this.profiles.get(ctx.params.username);
        this.profiles.unfollow(ctx.state.user, user);
        return { profile: this.profiles.view(user, ctx.state.user) };
    }
}
