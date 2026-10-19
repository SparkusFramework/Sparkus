import { HttpError, inject } from "sparkus";
import type { Article } from "../articles/article.ts";
import { ProfileService } from "../profiles/profiles.service.ts";
import type { User } from "../users/user.ts";
import { UserService } from "../users/users.service.ts";
import type { Comment } from "./comment.ts";
import type { CommentView } from "./comments.schemas.ts";

export class CommentService {
    private readonly users = inject(UserService);
    private readonly profiles = inject(ProfileService);
    // article id -> its comments, oldest first
    private readonly byArticle = new Map<number, Comment[]>();
    private nextId = 1;

    list(article: Article): readonly Comment[] {
        return this.byArticle.get(article.id) ?? [];
    }

    add(article: Article, author: User, body: string): Comment {
        const now = new Date().toISOString();
        const comment: Comment = { id: this.nextId++, articleId: article.id, authorId: author.id, body, createdAt: now, updatedAt: now };
        let list = this.byArticle.get(article.id);
        if (list === undefined) this.byArticle.set(article.id, (list = []));
        list.push(comment);
        return comment;
    }

    remove(article: Article, id: number, user: User): void {
        const list = this.byArticle.get(article.id);
        const index = list?.findIndex((c) => c.id === id) ?? -1;
        const comment = list?.[index];
        if (list === undefined || comment === undefined) {
            throw HttpError.notFound(`Comment ${id} not found on article "${article.slug}".`, { code: "COMMENT_NOT_FOUND" });
        }
        if (comment.authorId !== user.id) {
            throw HttpError.forbidden(`Only the author can delete comment ${id}.`, { code: "NOT_COMMENT_AUTHOR" });
        }
        list.splice(index, 1);
    }

    removeAll(article: Article): void {
        this.byArticle.delete(article.id);
    }

    view(comment: Comment, viewer: User | undefined): CommentView {
        const author = this.users.byId(comment.authorId);
        if (author === undefined) throw new Error(`Comment ${comment.id} has no author ${comment.authorId}.`);
        return {
            id: comment.id,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            body: comment.body,
            author: this.profiles.view(author, viewer),
        };
    }
}
