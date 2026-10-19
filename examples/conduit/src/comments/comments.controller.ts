import { Controller, Delete, Get, Post, UseGuards, inject, t, type Ctx } from "sparkus";
import { ArticleService } from "../articles/articles.service.ts";
import { AuthGuard } from "../auth/auth.guard.ts";
import { OptionalAuthGuard } from "../auth/optional-auth.guard.ts";
import type { User } from "../users/user.ts";
import { CommentList, CommentResponse, NewComment } from "./comments.schemas.ts";
import { CommentService } from "./comments.service.ts";

const List = { params: t.object({ slug: t.string({ min: 1 }) }), response: CommentList };
const Create = { params: t.object({ slug: t.string({ min: 1 }) }), body: t.object({ comment: NewComment }), response: CommentResponse };
const Remove = { params: t.object({ slug: t.string({ min: 1 }), id: t.integer({ min: 1 }) }), status: 204 };

@Controller("/api/articles/:slug/comments")
export class CommentController {
    private readonly articles = inject(ArticleService);
    private readonly comments = inject(CommentService);

    @Get("", List)
    @UseGuards(OptionalAuthGuard)
    list(ctx: Ctx<typeof List, { user?: User }>) {
        const article = this.articles.get(ctx.params.slug);
        return { comments: this.comments.list(article).map((c) => this.comments.view(c, ctx.state.user)) };
    }

    @Post("", Create)
    @UseGuards(AuthGuard)
    create(ctx: Ctx<typeof Create, { user: User }>) {
        const article = this.articles.get(ctx.params.slug);
        const comment = this.comments.add(article, ctx.state.user, ctx.body.comment.body);
        return { comment: this.comments.view(comment, ctx.state.user) };
    }

    @Delete("/:id", Remove)
    @UseGuards(AuthGuard)
    remove(ctx: Ctx<typeof Remove, { user: User }>) {
        this.comments.remove(this.articles.get(ctx.params.slug), ctx.params.id, ctx.state.user);
    }
}
