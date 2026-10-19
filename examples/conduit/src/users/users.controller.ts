import { Controller, Get, Post, Put, UseGuards, inject, t, type Ctx } from "sparkus";
import { AuthGuard } from "../auth/auth.guard.ts";
import { AuthService } from "../auth/auth.service.ts";
import type { User } from "./user.ts";
import { Credentials, NewUser, UserChanges, UserResponse } from "./users.schemas.ts";
import { UserService } from "./users.service.ts";

const Login = { body: t.object({ user: Credentials }), response: UserResponse };
const Register = { body: t.object({ user: NewUser }), response: UserResponse, status: 201 };
const Current = { response: UserResponse };
const Update = { body: t.object({ user: UserChanges }), response: UserResponse };

@Controller("/api")
export class UserController {
    private readonly users = inject(UserService);
    private readonly auth = inject(AuthService);

    @Post("/users/login", Login)
    login(ctx: Ctx<typeof Login>) {
        return this.withToken(this.users.login(ctx.body.user.email, ctx.body.user.password));
    }

    @Post("/users", Register)
    register(ctx: Ctx<typeof Register>) {
        const { username, email, password } = ctx.body.user;
        const user = this.users.register(username, email, password);
        ctx.log.info("User registered", { userId: user.id });
        return this.withToken(user);
    }

    @Get("/user", Current)
    @UseGuards(AuthGuard)
    current(ctx: Ctx<typeof Current, { user: User }>) {
        return this.withToken(ctx.state.user);
    }

    @Put("/user", Update)
    @UseGuards(AuthGuard)
    update(ctx: Ctx<typeof Update, { user: User }>) {
        return this.withToken(this.users.update(ctx.state.user, ctx.body.user));
    }

    // The entity goes out whole: UserResponse drops passwordHash, salt and id.
    private withToken(user: User) {
        return { user: { ...user, token: this.auth.sign(user) } };
    }
}
