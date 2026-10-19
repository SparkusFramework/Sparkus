import { describe, expect, test } from "bun:test";
import { auth, expectNoSecrets, newApp, register, type TestApp } from "../shared/test-helpers.ts";

async function setup(app: TestApp) {
    const jake = await register(app, "jake");
    const anna = await register(app, "anna");
    const res = await app.inject({
        method: "POST",
        url: "/api/articles",
        headers: auth(jake),
        body: { article: { title: "Hello", description: "d", body: "b" } },
    });
    return { jake, anna, slug: res.json().article.slug as string };
}

describe("comments", () => {
    test("add and list, anonymous and authenticated", async () => {
        const app = await newApp();
        const { jake, anna, slug } = await setup(app);
        const res = await app.inject({
            method: "POST",
            url: `/api/articles/${slug}/comments`,
            headers: auth(anna),
            body: { comment: { body: "Thank you so much!" } },
        });
        expect(res.status).toBe(200);
        expectNoSecrets(res.text);
        expect(res.json().comment).toEqual({
            id: expect.any(Number),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            body: "Thank you so much!",
            author: { username: "anna", bio: null, image: null, following: false },
        });
        await app.inject({ method: "POST", url: "/api/profiles/anna/follow", headers: auth(jake) });
        const mine = (await app.inject({ url: `/api/articles/${slug}/comments`, headers: auth(jake) })).json();
        expect(mine.comments[0].author.following).toBe(true);
        const anon = (await app.inject({ url: `/api/articles/${slug}/comments` })).json();
        expect(anon.comments.length).toBe(1);
        expect(anon.comments[0].author.following).toBe(false);
    });

    test("errors: unknown article 404, no auth 401, empty body 422", async () => {
        const app = await newApp();
        const { anna, slug } = await setup(app);
        expect((await app.inject({ url: "/api/articles/nope/comments" })).status).toBe(404);
        const anon = await app.inject({ method: "POST", url: `/api/articles/${slug}/comments`, body: { comment: { body: "x" } } });
        expect(anon.status).toBe(401);
        const empty = await app.inject({
            method: "POST",
            url: `/api/articles/${slug}/comments`,
            headers: auth(anna),
            body: { comment: { body: "" } },
        });
        expect(empty.status).toBe(422);
    });

    test("delete: author only, 204, unknown id 404", async () => {
        const app = await newApp();
        const { jake, anna, slug } = await setup(app);
        const { comment } = (
            await app.inject({ method: "POST", url: `/api/articles/${slug}/comments`, headers: auth(anna), body: { comment: { body: "hi" } } })
        ).json();
        const url = `/api/articles/${slug}/comments/${comment.id}`;
        const forbidden = await app.inject({ method: "DELETE", url, headers: auth(jake) });
        expect(forbidden.status).toBe(403);
        expect(forbidden.json().code).toBe("NOT_COMMENT_AUTHOR");
        expect((await app.inject({ method: "DELETE", url, headers: auth(anna) })).status).toBe(204);
        expect((await app.inject({ method: "DELETE", url, headers: auth(anna) })).status).toBe(404);
        expect((await app.inject({ method: "DELETE", url: `/api/articles/${slug}/comments/abc`, headers: auth(anna) })).status).toBe(422);
        expect((await app.inject({ url: `/api/articles/${slug}/comments` })).json().comments).toEqual([]);
    });
});
