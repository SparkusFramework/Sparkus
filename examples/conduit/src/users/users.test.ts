import { describe, expect, test } from "bun:test";
import { auth, expectNoSecrets, newApp, register } from "../shared/test-helpers.ts";

describe("users", () => {
    test("register returns 201 with a token and no secrets", async () => {
        const app = await newApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/users",
            body: { user: { username: "jake", email: "Jake@Jake.jake", password: "jakejake", role: "admin" } },
        });
        expect(res.status).toBe(201);
        expectNoSecrets(res.text);
        const { user } = res.json();
        expect(user).toEqual({ email: "jake@jake.jake", token: expect.any(String), username: "jake", bio: null, image: null });
    });

    test("login, then GET /api/user with the token", async () => {
        const app = await newApp();
        await register(app, "jake");
        const login = await app.inject({
            method: "POST",
            url: "/api/users/login",
            body: { user: { email: "jake@example.com", password: "password123" } },
        });
        expect(login.status).toBe(200);
        expectNoSecrets(login.text);
        const token = login.json().user.token;
        const me = await app.inject({ url: "/api/user", headers: auth(token) });
        expect(me.status).toBe(200);
        expect(me.json().user.username).toBe("jake");
        expectNoSecrets(me.text);
    });

    test("wrong password is a 401 with RealWorld errors", async () => {
        const app = await newApp();
        await register(app, "jake");
        const res = await app.inject({
            method: "POST",
            url: "/api/users/login",
            body: { user: { email: "jake@example.com", password: "nope-nope" } },
        });
        expect(res.status).toBe(401);
        expect(res.json().code).toBe("INVALID_CREDENTIALS");
        expect(res.json().errors).toEqual({ "email or password": ["is invalid"] });
    });

    test("missing field is a 422 with errors.body", async () => {
        const app = await newApp();
        const res = await app.inject({ method: "POST", url: "/api/users", body: { user: { username: "x", email: "x@x.io" } } });
        expect(res.status).toBe(422);
        expect(res.json().errors.body[0]).toContain("$.user.password");
    });

    test("duplicate email and username are 422 per field", async () => {
        const app = await newApp();
        await register(app, "jake");
        const email = await app.inject({
            method: "POST",
            url: "/api/users",
            body: { user: { username: "other", email: "JAKE@example.com", password: "password123" } },
        });
        expect(email.status).toBe(422);
        expect(email.json().errors).toEqual({ email: ["has already been taken"] });
        const name = await app.inject({
            method: "POST",
            url: "/api/users",
            body: { user: { username: "jake", email: "new@example.com", password: "password123" } },
        });
        expect(name.json().errors).toEqual({ username: ["has already been taken"] });
    });

    test("invalid email is a 422", async () => {
        const app = await newApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/users",
            body: { user: { username: "jake", email: "not-an-email", password: "password123" } },
        });
        expect(res.status).toBe(422);
        expect(res.json().code).toBe("EMAIL_INVALID");
    });

    test("GET /api/user without or with a bad token is a 401", async () => {
        const app = await newApp();
        const none = await app.inject({ url: "/api/user" });
        expect(none.status).toBe(401);
        expect(none.json().code).toBe("AUTH_REQUIRED");
        expect(none.json().errors.body).toEqual(["Authentication required."]);
        const bad = await app.inject({ url: "/api/user", headers: auth("a.b.c") });
        expect(bad.status).toBe(401);
        expect(bad.json().code).toBe("AUTH_INVALID");
        const malformed = await app.inject({ url: "/api/user", headers: { authorization: "Basic xyz" } });
        expect(malformed.json().code).toBe("AUTH_MALFORMED");
    });

    test("a token signed with another secret is refused", async () => {
        const app = await newApp();
        const token = await register(app, "jake");
        const [h, p] = token.split(".");
        const res = await app.inject({ url: "/api/user", headers: auth(`${h}.${p}.AAAA`) });
        expect(res.status).toBe(401);
    });

    test("PUT /api/user updates fields, null clears bio, the new password works", async () => {
        const app = await newApp();
        const token = await register(app, "jake");
        const res = await app.inject({
            method: "PUT",
            url: "/api/user",
            headers: auth(token),
            body: { user: { bio: "I work at statefarm", image: "https://i.example/j.png", username: "jacob", password: "newpassword" } },
        });
        expect(res.status).toBe(200);
        expectNoSecrets(res.text);
        expect(res.json().user).toMatchObject({ username: "jacob", bio: "I work at statefarm", image: "https://i.example/j.png" });
        const cleared = await app.inject({ method: "PUT", url: "/api/user", headers: auth(token), body: { user: { bio: null } } });
        expect(cleared.json().user.bio).toBeNull();
        expect(cleared.json().user.image).toBe("https://i.example/j.png");
        const login = await app.inject({
            method: "POST",
            url: "/api/users/login",
            body: { user: { email: "jake@example.com", password: "newpassword" } },
        });
        expect(login.status).toBe(200);
    });

    test("PUT /api/user cannot take another user's username", async () => {
        const app = await newApp();
        await register(app, "jake");
        const token = await register(app, "anna");
        const res = await app.inject({ method: "PUT", url: "/api/user", headers: auth(token), body: { user: { username: "jake" } } });
        expect(res.status).toBe(422);
    });
});
