import { describe, expect, test } from "bun:test";
import { auth, expectNoSecrets, newApp, register, type TestApp } from "../shared/test-helpers.ts";

const dragon = { title: "How to train your dragon", description: "Ever wonder how?", body: "You have to believe", tagList: ["dragons", "training"] };

async function create(app: TestApp, token: string, article: object = dragon) {
    const res = await app.inject({ method: "POST", url: "/api/articles", headers: auth(token), body: { article } });
    if (res.status !== 201) throw new Error(`create: ${res.status} ${res.text}`);
    return res.json().article;
}

describe("articles", () => {
    test("POST creates a 201 article with a slug, ISO dates and its author", async () => {
        const app = await newApp();
        const token = await register(app, "jake");
        const res = await app.inject({ method: "POST", url: "/api/articles", headers: auth(token), body: { article: dragon } });
        expect(res.status).toBe(201);
        expectNoSecrets(res.text);
        const article = res.json().article;
        expect(article).toEqual({
            slug: "how-to-train-your-dragon",
            title: dragon.title,
            description: dragon.description,
            body: dragon.body,
            tagList: ["dragons", "training"],
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            favorited: false,
            favoritesCount: 0,
            author: { username: "jake", bio: null, image: null, following: false },
        });
        expect(new Date(article.createdAt).toISOString()).toBe(article.createdAt);
    });

    test("POST validates: missing title is a 422, no auth is a 401", async () => {
        const app = await newApp();
        const token = await register(app, "jake");
        const bad = await app.inject({
            method: "POST",
            url: "/api/articles",
            headers: auth(token),
            body: { article: { description: "d", body: "b" } },
        });
        expect(bad.status).toBe(422);
        expect(bad.json().errors.body[0]).toContain("$.article.title");
        expect((await app.inject({ method: "POST", url: "/api/articles", body: { article: dragon } })).status).toBe(401);
    });

    test("GET by slug with optional auth; unknown slug is a 404", async () => {
        const app = await newApp();
        const token = await register(app, "jake");
        const { slug } = await create(app, token);
        const anon = await app.inject({ url: `/api/articles/${slug}` });
        expect(anon.status).toBe(200);
        expect(anon.json().article.body).toBe(dragon.body);
        expect((await app.inject({ url: "/api/articles/nope" })).json().code).toBe("ARTICLE_NOT_FOUND");
    });

    test("list: most recent first, no body, filters by tag, author, favorited", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        const anna = await register(app, "anna");
        await create(app, jake, { title: "One", description: "d", body: "b", tagList: ["a"] });
        await create(app, anna, { title: "Two", description: "d", body: "b", tagList: ["b"] });
        await create(app, jake, { title: "Three", description: "d", body: "b", tagList: ["a", "b"] });
        await app.inject({ method: "POST", url: "/api/articles/two/favorite", headers: auth(jake) });

        const all = (await app.inject({ url: "/api/articles" })).json();
        expect(all.articlesCount).toBe(3);
        expect(all.articles.map((a: { title: string }) => a.title)).toEqual(["Three", "Two", "One"]);
        for (const article of all.articles) expect(article).not.toHaveProperty("body");

        const titles = async (query: string) =>
            (await app.inject({ url: `/api/articles?${query}` })).json().articles.map((a: { title: string }) => a.title);
        expect(await titles("tag=a")).toEqual(["Three", "One"]);
        expect(await titles("author=anna")).toEqual(["Two"]);
        expect(await titles("favorited=jake")).toEqual(["Two"]);
        expect(await titles("author=ghost")).toEqual([]);
        expect(await titles("tag=a&author=jake")).toEqual(["Three", "One"]);
    });

    test("list: favorited flag follows the viewer", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        const { slug } = await create(app, jake);
        await app.inject({ method: "POST", url: `/api/articles/${slug}/favorite`, headers: auth(jake) });
        expect((await app.inject({ url: "/api/articles", headers: auth(jake) })).json().articles[0].favorited).toBe(true);
        const anon = (await app.inject({ url: "/api/articles" })).json().articles[0];
        expect(anon.favorited).toBe(false);
        expect(anon.favoritesCount).toBe(1);
    });

    test("pagination: limit and offset, count is the total", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        for (let i = 0; i < 25; i++) await create(app, jake, { title: `Post ${i}`, description: "d", body: "b" });
        const first = (await app.inject({ url: "/api/articles" })).json();
        expect(first.articles.length).toBe(20);
        expect(first.articlesCount).toBe(25);
        const page = (await app.inject({ url: "/api/articles?limit=5&offset=22" })).json();
        expect(page.articles.map((a: { title: string }) => a.title)).toEqual(["Post 2", "Post 1", "Post 0"]);
        const filtered = (await app.inject({ url: "/api/articles?author=jake&limit=2&offset=1" })).json();
        expect(filtered.articles.map((a: { title: string }) => a.title)).toEqual(["Post 23", "Post 22"]);
        expect(filtered.articlesCount).toBe(25);
        const bad = await app.inject({ url: "/api/articles?limit=0" });
        expect(bad.status).toBe(422);
        expect(bad.json().errors.body[0]).toContain("limit");
    });

    test("feed: only followed authors, needs auth", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        const anna = await register(app, "anna");
        const bob = await register(app, "bob");
        await create(app, anna, { title: "By anna", description: "d", body: "b" });
        await create(app, bob, { title: "By bob", description: "d", body: "b" });
        expect((await app.inject({ url: "/api/articles/feed", headers: auth(jake) })).json()).toEqual({ articles: [], articlesCount: 0 });
        await app.inject({ method: "POST", url: "/api/profiles/anna/follow", headers: auth(jake) });
        const feed = (await app.inject({ url: "/api/articles/feed", headers: auth(jake) })).json();
        expect(feed.articlesCount).toBe(1);
        expect(feed.articles[0].title).toBe("By anna");
        expect(feed.articles[0].author.following).toBe(true);
        expect((await app.inject({ url: "/api/articles/feed" })).status).toBe(401);
    });

    test("PUT: author only, title change changes the slug", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        const anna = await register(app, "anna");
        const { slug } = await create(app, jake);
        const forbidden = await app.inject({ method: "PUT", url: `/api/articles/${slug}`, headers: auth(anna), body: { article: { body: "x" } } });
        expect(forbidden.status).toBe(403);
        expect(forbidden.json().code).toBe("NOT_ARTICLE_AUTHOR");
        const res = await app.inject({
            method: "PUT",
            url: `/api/articles/${slug}`,
            headers: auth(jake),
            body: { article: { title: "Did you train your dragon?" } },
        });
        expect(res.status).toBe(200);
        expect(res.json().article.slug).toBe("did-you-train-your-dragon");
        expect(res.json().article.body).toBe(dragon.body);
        expect((await app.inject({ url: `/api/articles/${slug}` })).status).toBe(404);
        expect((await app.inject({ url: "/api/articles/did-you-train-your-dragon" })).status).toBe(200);
    });

    test("same title twice gets a distinct slug", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        const a = await create(app, jake);
        const b = await create(app, jake);
        expect(a.slug).not.toBe(b.slug);
    });

    test("DELETE: author only, 204, then 404", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        const anna = await register(app, "anna");
        const { slug } = await create(app, jake);
        expect((await app.inject({ method: "DELETE", url: `/api/articles/${slug}`, headers: auth(anna) })).status).toBe(403);
        const res = await app.inject({ method: "DELETE", url: `/api/articles/${slug}`, headers: auth(jake) });
        expect(res.status).toBe(204);
        expect(res.text).toBe("");
        expect((await app.inject({ url: `/api/articles/${slug}` })).status).toBe(404);
        expect((await app.inject({ url: "/api/tags" })).json().tags).toEqual([]);
    });

    test("favorite / unfavorite", async () => {
        const app = await newApp();
        const jake = await register(app, "jake");
        const anna = await register(app, "anna");
        const { slug } = await create(app, jake);
        const fav = await app.inject({ method: "POST", url: `/api/articles/${slug}/favorite`, headers: auth(anna) });
        expect(fav.json().article).toMatchObject({ favorited: true, favoritesCount: 1 });
        const unfav = await app.inject({ method: "DELETE", url: `/api/articles/${slug}/favorite`, headers: auth(anna) });
        expect(unfav.json().article).toMatchObject({ favorited: false, favoritesCount: 0 });
        expect((await app.inject({ method: "POST", url: "/api/articles/nope/favorite", headers: auth(anna) })).status).toBe(404);
    });
});
