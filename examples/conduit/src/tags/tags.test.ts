import { expect, test } from "bun:test";
import { auth, newApp, register } from "../shared/test-helpers.ts";

test("GET /api/tags lists distinct tags", async () => {
    const app = await newApp();
    expect((await app.inject({ url: "/api/tags" })).json()).toEqual({ tags: [] });
    const token = await register(app, "jake");
    for (const tagList of [["a", "b"], ["b", "c", "c"]]) {
        await app.inject({
            method: "POST",
            url: "/api/articles",
            headers: auth(token),
            body: { article: { title: "t", description: "d", body: "b", tagList } },
        });
    }
    expect((await app.inject({ url: "/api/tags" })).json().tags.sort()).toEqual(["a", "b", "c"]);
});
