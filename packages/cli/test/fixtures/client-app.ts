// The app the generated client of client.test.ts is built from (fixtures/client/api.ts).
import { Controller, Delete, Get, HttpError, Post, Put, UseGuards, createApp, t, type Ctx } from "sparkus";

const Article = t.object({
    id: t.integer(),
    title: t.string(),
    tags: t.array(t.string()),
    author: t.optional(t.object({ name: t.string() })),
});

const ListArticles = {
    query: t.object({ tag: t.optional(t.string()), page: t.optional(t.integer({ min: 1 })) }),
    response: t.array(Article),
};
const GetArticle = { params: t.object({ id: t.integer({ min: 1 }) }), response: Article };
const CreateArticle = {
    body: t.object({ title: t.string({ min: 1 }), tags: t.optional(t.array(t.string())) }),
    response: Article,
    status: 201,
};
const Search = { query: t.object({ q: t.string(), exact: t.optional(t.boolean()) }) };

const ARTICLES = [{ id: 1, title: "Hello", tags: ["intro"], author: { name: "Ada", email: "ada@example.com" } }];

const adminOnly = (ctx: Ctx) => {
    if (ctx.header("authorization") !== "Bearer admin") throw HttpError.unauthorized("Admins only.", { code: "NOT_ADMIN" });
    return true;
};

@Controller("/articles")
class ArticleController {
    @Get("", ListArticles)
    list(ctx: Ctx<typeof ListArticles>) {
        return ARTICLES.filter((a) => ctx.query.tag === undefined || a.tags.includes(ctx.query.tag));
    }

    @Get("/search", Search)
    search(ctx: Ctx<typeof Search>) {
        return { q: ctx.query.q, exact: ctx.query.exact ?? false };
    }

    @Get("/:id", GetArticle)
    get(ctx: Ctx<typeof GetArticle>) {
        const article = ARTICLES.find((a) => a.id === ctx.params.id);
        if (article === undefined) throw HttpError.notFound(`Article ${ctx.params.id} not found.`, { code: "ARTICLE_NOT_FOUND" });
        return article;
    }

    @Post("", CreateArticle)
    create(ctx: Ctx<typeof CreateArticle>) {
        return { id: 2, title: ctx.body.title, tags: ctx.body.tags ?? [] };
    }

    @Delete("/:id")
    @UseGuards(adminOnly)
    remove() {}
}

@Controller("/health")
class Health {
    @Get("")
    check() {
        return "ok";
    }

    @Put("/:service/state")
    setState(ctx: Ctx) {
        return { service: ctx.params.service };
    }
}

export default createApp({ controllers: [ArticleController, Health] });
