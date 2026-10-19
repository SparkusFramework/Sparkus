import { describe, expect, test } from "bun:test";
import { auth, expectNoSecrets, newApp, register } from "../shared/test-helpers.ts";

describe("profiles", () => {
    test("anonymous GET shows following: false", async () => {
        const app = await newApp();
        await register(app, "celeb");
        const res = await app.inject({ url: "/api/profiles/celeb" });
        expect(res.status).toBe(200);
        expectNoSecrets(res.text);
        expect(res.json()).toEqual({ profile: { username: "celeb", bio: null, image: null, following: false } });
    });

    test("follow, see it with optional auth, unfollow", async () => {
        const app = await newApp();
        await register(app, "celeb");
        const fan = await register(app, "fan");
        const follow = await app.inject({ method: "POST", url: "/api/profiles/celeb/follow", headers: auth(fan) });
        expect(follow.status).toBe(200);
        expect(follow.json().profile.following).toBe(true);
        expect((await app.inject({ url: "/api/profiles/celeb", headers: auth(fan) })).json().profile.following).toBe(true);
        expect((await app.inject({ url: "/api/profiles/celeb" })).json().profile.following).toBe(false);
        const unfollow = await app.inject({ method: "DELETE", url: "/api/profiles/celeb/follow", headers: auth(fan) });
        expect(unfollow.json().profile.following).toBe(false);
    });

    test("unknown profile is a 404", async () => {
        const app = await newApp();
        const res = await app.inject({ url: "/api/profiles/ghost" });
        expect(res.status).toBe(404);
        expect(res.json().code).toBe("PROFILE_NOT_FOUND");
    });

    test("follow needs auth; a bad token on an optional-auth route is still a 401", async () => {
        const app = await newApp();
        await register(app, "celeb");
        expect((await app.inject({ method: "POST", url: "/api/profiles/celeb/follow" })).status).toBe(401);
        expect((await app.inject({ url: "/api/profiles/celeb", headers: auth("bad") })).status).toBe(401);
    });
});
