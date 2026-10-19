import { HttpError, inject } from "sparkus";
import { ProfileService } from "../profiles/profiles.service.ts";
import type { User } from "../users/user.ts";
import { UserService } from "../users/users.service.ts";
import type { Article } from "./article.ts";
import type { ArticleChanges, ArticleQuery, ArticleView, NewArticle } from "./articles.schemas.ts";

export interface ArticlePage {
    articles: ArticleView[];
    articlesCount: number;
}

export function slugify(title: string): string {
    const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug === "" ? "article" : slug;
}

export class ArticleService {
    private readonly users = inject(UserService);
    private readonly profiles = inject(ProfileService);
    private readonly bySlug = new Map<string, Article>();
    // Oldest first: lists walk it backwards (most recent first) without sorting.
    private readonly ordered: Article[] = [];
    private readonly tagCounts = new Map<string, number>();
    private nextId = 1;

    get(slug: string): Article {
        const article = this.bySlug.get(slug);
        if (article === undefined) throw HttpError.notFound(`Article "${slug}" not found.`, { code: "ARTICLE_NOT_FOUND" });
        return article;
    }

    tags(): string[] {
        return [...this.tagCounts.keys()];
    }

    list(filter: ArticleQuery, viewer: User | undefined): ArticlePage {
        const { limit, offset } = filter;
        let authorId: number | undefined;
        let fanId: number | undefined;
        if (filter.author !== undefined) {
            authorId = this.users.byUsername(filter.author)?.id;
            if (authorId === undefined) return { articles: [], articlesCount: 0 };
        }
        if (filter.favorited !== undefined) {
            fanId = this.users.byUsername(filter.favorited)?.id;
            if (fanId === undefined) return { articles: [], articlesCount: 0 };
        }
        const tag = filter.tag;
        if (authorId === undefined && fanId === undefined && tag === undefined) return this.page(limit, offset, viewer);
        return this.scan(
            (a) =>
                (authorId === undefined || a.authorId === authorId) &&
                (fanId === undefined || a.favoritedBy.has(fanId)) &&
                (tag === undefined || a.tagList.includes(tag)),
            limit,
            offset,
            viewer,
        );
    }

    feed(viewer: User, limit: number, offset: number): ArticlePage {
        const followed = this.profiles.following(viewer.id);
        if (followed.size === 0) return { articles: [], articlesCount: 0 };
        return this.scan((a) => followed.has(a.authorId), limit, offset, viewer);
    }

    create(author: User, input: NewArticle): Article {
        const now = new Date().toISOString();
        const id = this.nextId++;
        const tagList = [...new Set(input.tagList ?? [])];
        const article: Article = {
            id,
            slug: this.uniqueSlug(input.title, id),
            title: input.title,
            description: input.description,
            body: input.body,
            tagList,
            createdAt: now,
            updatedAt: now,
            authorId: author.id,
            favoritedBy: new Set(),
        };
        this.bySlug.set(article.slug, article);
        this.ordered.push(article);
        for (const tag of tagList) this.tagCounts.set(tag, (this.tagCounts.get(tag) ?? 0) + 1);
        return article;
    }

    update(slug: string, user: User, changes: ArticleChanges): Article {
        const article = this.owned(slug, user);
        if (changes.title !== undefined && changes.title !== article.title) {
            this.bySlug.delete(article.slug);
            article.title = changes.title;
            article.slug = this.uniqueSlug(changes.title, article.id);
            this.bySlug.set(article.slug, article);
        }
        if (changes.description !== undefined) article.description = changes.description;
        if (changes.body !== undefined) article.body = changes.body;
        article.updatedAt = new Date().toISOString();
        return article;
    }

    remove(slug: string, user: User): Article {
        const article = this.owned(slug, user);
        this.bySlug.delete(article.slug);
        this.ordered.splice(this.ordered.indexOf(article), 1);
        for (const tag of article.tagList) {
            const count = (this.tagCounts.get(tag) ?? 1) - 1;
            if (count === 0) this.tagCounts.delete(tag);
            else this.tagCounts.set(tag, count);
        }
        return article;
    }

    favorite(slug: string, user: User): Article {
        const article = this.get(slug);
        article.favoritedBy.add(user.id);
        return article;
    }

    unfavorite(slug: string, user: User): Article {
        const article = this.get(slug);
        article.favoritedBy.delete(user.id);
        return article;
    }

    view(article: Article, viewer: User | undefined): ArticleView {
        const author = this.users.byId(article.authorId);
        if (author === undefined) throw new Error(`Article ${article.id} has no author ${article.authorId}.`);
        return {
            slug: article.slug,
            title: article.title,
            description: article.description,
            body: article.body,
            tagList: article.tagList,
            createdAt: article.createdAt,
            updatedAt: article.updatedAt,
            favorited: viewer !== undefined && article.favoritedBy.has(viewer.id),
            favoritesCount: article.favoritedBy.size,
            author: this.profiles.view(author, viewer),
        };
    }

    private owned(slug: string, user: User): Article {
        const article = this.get(slug);
        if (article.authorId !== user.id) {
            throw HttpError.forbidden(`Only the author can change article "${slug}".`, { code: "NOT_ARTICLE_AUTHOR" });
        }
        return article;
    }

    private uniqueSlug(title: string, id: number): string {
        const slug = slugify(title);
        const owner = this.bySlug.get(slug);
        return owner === undefined || owner.id === id ? slug : `${slug}-${id}`;
    }

    private page(limit: number, offset: number, viewer: User | undefined): ArticlePage {
        const articles: ArticleView[] = [];
        const total = this.ordered.length;
        for (let i = total - 1 - offset; i >= 0 && articles.length < limit; i--) {
            articles.push(this.view(this.ordered[i]!, viewer));
        }
        return { articles, articlesCount: total };
    }

    private scan(match: (a: Article) => boolean, limit: number, offset: number, viewer: User | undefined): ArticlePage {
        const articles: ArticleView[] = [];
        let count = 0;
        for (let i = this.ordered.length - 1; i >= 0; i--) {
            const article = this.ordered[i]!;
            if (!match(article)) continue;
            if (count >= offset && articles.length < limit) articles.push(this.view(article, viewer));
            count++;
        }
        return { articles, articlesCount: count };
    }
}
