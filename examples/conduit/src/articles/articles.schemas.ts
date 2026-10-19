import { t, type Infer } from "sparkus";
import { Profile } from "../profiles/profiles.schemas.ts";

const articleFields = {
    slug: t.string(),
    title: t.string(),
    description: t.string(),
    tagList: t.array(t.string()),
    createdAt: t.string(),
    updatedAt: t.string(),
    favorited: t.boolean(),
    favoritesCount: t.integer(),
    author: Profile,
};

export const ArticleView = t.object({ ...articleFields, body: t.string() });
export type ArticleView = Infer<typeof ArticleView>;

export const ArticleResponse = t.object({ article: ArticleView });

// Lists leave the body out: this schema has no `body`, so it is dropped from each element.
export const ArticleList = t.object({
    articles: t.array(t.object(articleFields)),
    articlesCount: t.integer(),
});

export const NewArticle = t.object({
    title: t.string({ min: 1, max: 200 }),
    description: t.string({ min: 1, max: 1000 }),
    body: t.string({ min: 1, max: 100_000 }),
    tagList: t.optional(t.array(t.string({ min: 1, max: 50 }), { max: 20 })),
});
export type NewArticle = Infer<typeof NewArticle>;

export const ArticleChanges = t.object({
    title: t.optional(t.string({ min: 1, max: 200 })),
    description: t.optional(t.string({ min: 1, max: 1000 })),
    body: t.optional(t.string({ min: 1, max: 100_000 })),
});
export type ArticleChanges = Infer<typeof ArticleChanges>;

const page = {
    limit: t.integer({ min: 1, max: 100, default: 20 }),
    offset: t.integer({ min: 0, default: 0 }),
};

export const FeedQuery = t.object(page);

export const ArticleQuery = t.object({
    tag: t.optional(t.string({ min: 1 })),
    author: t.optional(t.string({ min: 1 })),
    favorited: t.optional(t.string({ min: 1 })),
    ...page,
});
export type ArticleQuery = Infer<typeof ArticleQuery>;
