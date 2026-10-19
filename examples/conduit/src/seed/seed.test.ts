import { createTestApp, type TestApp } from "@sparkus/testing";
import { expect, test } from "bun:test";
import { options } from "../app.ts";
import { AppConfig } from "../config.ts";

async function seededApp(count: number) {
    const started = performance.now();
    const app = await createTestApp({ ...options, overrides: [AppConfig.override({ CONDUIT_SEED: count })] });
    return { app, ms: performance.now() - started };
}

async function login(app: TestApp, email: string): Promise<string> {
    const res = await app.inject({ method: "POST", url: "/api/users/login", body: { user: { email, password: "password" } } });
    expect(res.status).toBe(200);
    return res.json().user.token;
}

test("CONDUIT_SEED=1000 seeds users, follows, articles, comments, favorites in well under a second", async () => {
    const { app, ms } = await seededApp(1000);
    expect(ms).toBeLessThan(1000);
    const list = (await app.inject({ url: "/api/articles?limit=1" })).json();
    expect(list.articlesCount).toBe(1000);
    expect(list.articles[0].title).toBe("Article 999");
    expect(list.articles[0].tagList.length).toBe(3);

    const slug = list.articles[0].slug;
    expect((await app.inject({ url: `/api/articles/${slug}` })).json().article.body.length).toBeGreaterThan(900);
    expect((await app.inject({ url: `/api/articles/${slug}/comments` })).json().comments.length).toBe(3);

    const token = await login(app, "user0@conduit.test");
    const feed = (await app.inject({ url: "/api/articles/feed?limit=5", headers: { authorization: `Token ${token}` } })).json();
    // user0 follows user1 and user2: 2 authors out of 10.
    expect(feed.articlesCount).toBe(200);
    expect(feed.articles.every((a: { author: { username: string } }) => ["user1", "user2"].includes(a.author.username))).toBe(true);
    expect((await app.inject({ url: "/api/tags" })).json().tags.length).toBe(10);
    await login(app, "user9@conduit.test");
});

test("no seed by default", async () => {
    const { app } = await seededApp(0);
    expect((await app.inject({ url: "/api/articles" })).json().articlesCount).toBe(0);
});
