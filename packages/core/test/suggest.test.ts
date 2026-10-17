import { expect, test } from "bun:test";
import { Controller, Delete, Get, Post, createApp, type Ctx } from "../src/index.js";

@Controller("/users")
class Users {
    @Get("")
    list() {
        return [];
    }
    @Get("/:id")
    get(ctx: Ctx) {
        return ctx.params;
    }
    @Post("")
    create() {}
    @Delete("/:id/sessions")
    logout() {}
}

async function detail(url: string, method = "GET", exposeErrors = true) {
    const app = createApp({ controllers: [Users], exposeErrors });
    await app.init();
    const body = (await (await app.fetch(new Request("http://x" + url, { method }))).json()) as { detail: string };
    return body.detail;
}

test("404 suggests the closest route when errors are exposed", async () => {
    expect(await detail("/user/42")).toBe("No route matches GET /user/42. Did you mean GET /users/:id?");
    expect(await detail("/USERS")).toBe("No route matches GET /USERS. Did you mean GET /users?");
    expect(await detail("/users/")).toBe("No route matches GET /users/. Did you mean GET /users?");
    expect(await detail("/users/7/sesions", "DELETE")).toBe(
        "No route matches DELETE /users/7/sesions. Did you mean DELETE /users/:id/sessions?",
    );
});

test("no suggestion for unrelated paths, or in production", async () => {
    expect(await detail("/billing/invoices/2024")).toBe("No route matches GET /billing/invoices/2024.");
    expect(await detail("/user/42", "GET", false)).toBe("No route matches GET /user/42.");
});
