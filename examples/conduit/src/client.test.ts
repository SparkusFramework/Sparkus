import { expect, test } from "bun:test";
import { ApiError, createClient } from "./client.ts";
import { newApp } from "./shared/test-helpers.ts";

test("the generated client drives the whole flow", async () => {
    const app = await newApp();
    let token: string | undefined;
    const api = createClient({
        baseUrl: "http://test",
        fetch: (request) => app.fetch(request),
        headers: (): Record<string, string> => (token === undefined ? {} : { authorization: `Token ${token}` }),
    });

    const { user } = await api.user.register({ body: { user: { username: "jake", email: "jake@jake.jake", password: "jakejake" } } });
    token = user.token;
    expect(user.bio).toBeNull();

    const { article } = await api.article.create({
        body: { article: { title: "Client made", description: "d", body: "b", tagList: ["gen"] } },
    });
    expect(article.slug).toBe("client-made");

    await api.comment.create({ params: { slug: article.slug }, body: { comment: { body: "first" } } });
    const { comments } = await api.comment.list({ params: { slug: article.slug } });
    expect(comments.map((c) => c.body)).toEqual(["first"]);

    const list = await api.article.list({ query: { tag: "gen", limit: 10 } });
    expect(list.articlesCount).toBe(1);
    expect(list.articles[0]?.author.username).toBe("jake");

    expect((await api.tag.list()).tags).toEqual(["gen"]);

    await api.article.remove({ params: { slug: article.slug } });
    const error = await api.article.get({ params: { slug: article.slug } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe("ARTICLE_NOT_FOUND");
    expect((error as ApiError).problem.errors).toEqual({ body: [`Article "client-made" not found.`] });
});
