import { Controller, Delete, Get, Post, Put, UseGuards, inject, t, type Ctx } from "sparkus";
import { AuthGuard } from "../auth/auth.guard.ts";
import { OptionalAuthGuard } from "../auth/optional-auth.guard.ts";
import { CommentService } from "../comments/comments.service.ts";
import { SeedService } from "../seed/seed.service.ts";
import type { User } from "../users/user.ts";
import {
    ArticleChanges,
    ArticleList,
    ArticleQuery,
    ArticleResponse,
    FeedQuery,
    NewArticle,
} from "./articles.schemas.ts";
import { ArticleService } from "./articles.service.ts";

const Slug = t.object({ slug: t.string({ min: 1 }) });

const List = { query: ArticleQuery, response: ArticleList };
const Feed = { query: FeedQuery, response: ArticleList };
const GetArticle = { params: Slug, response: ArticleResponse };
const Create = { body: t.object({ article: NewArticle }), response: ArticleResponse, status: 201 };
const Update = { params: Slug, body: t.object({ article: ArticleChanges }), response: ArticleResponse };
const Remove = { params: Slug, status: 204 };
const Favorite = { params: Slug, response: ArticleResponse };

@Controller("/api/articles")
export class ArticleController {
    private readonly articles = inject(ArticleService);
    private readonly comments = inject(CommentService);
    // Unused here: injecting it is what creates SeedService at startup, so its onInit() seeds (CONDUIT_SEED).
    // app.get(SeedService) before init() also works, until anything it injects uses Logger (SPK1010, FRICTION.md).
    private readonly seed = inject(SeedService);

    @Get("", List)
    @UseGuards(OptionalAuthGuard)
    list(ctx: Ctx<typeof List, { user?: User }>) {
        return this.articles.list(ctx.query, ctx.state.user);
    }

    @Get("/feed", Feed)
    @UseGuards(AuthGuard)
    feed(ctx: Ctx<typeof Feed, { user: User }>) {
        return this.articles.feed(ctx.state.user, ctx.query.limit, ctx.query.offset);
    }

    @Get("/:slug", GetArticle)
    @UseGuards(OptionalAuthGuard)
    get(ctx: Ctx<typeof GetArticle, { user?: User }>) {
        return { article: this.articles.view(this.articles.get(ctx.params.slug), ctx.state.user) };
    }

    @Post("", Create)
    @UseGuards(AuthGuard)
    create(ctx: Ctx<typeof Create, { user: User }>) {
        const article = this.articles.create(ctx.state.user, ctx.body.article);
        return { article: this.articles.view(article, ctx.state.user) };
    }

    @Put("/:slug", Update)
    @UseGuards(AuthGuard)
    update(ctx: Ctx<typeof Update, { user: User }>) {
        const article = this.articles.update(ctx.params.slug, ctx.state.user, ctx.body.article);
        return { article: this.articles.view(article, ctx.state.user) };
    }

    @Delete("/:slug", Remove)
    @UseGuards(AuthGuard)
    remove(ctx: Ctx<typeof Remove, { user: User }>) {
        const article = this.articles.remove(ctx.params.slug, ctx.state.user);
        // Here and not in ArticleService: CommentService already depends on ArticleService (SPK1002 otherwise).
        this.comments.removeAll(article);
    }

    @Post("/:slug/favorite", Favorite)
    @UseGuards(AuthGuard)
    favorite(ctx: Ctx<typeof Favorite, { user: User }>) {
        return { article: this.articles.view(this.articles.favorite(ctx.params.slug, ctx.state.user), ctx.state.user) };
    }

    @Delete("/:slug/favorite", Favorite)
    @UseGuards(AuthGuard)
    unfavorite(ctx: Ctx<typeof Favorite, { user: User }>) {
        return { article: this.articles.view(this.articles.unfavorite(ctx.params.slug, ctx.state.user), ctx.state.user) };
    }
}
