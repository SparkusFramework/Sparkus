export interface Article {
    id: number;
    slug: string;
    title: string;
    description: string;
    body: string;
    tagList: string[];
    createdAt: string;
    updatedAt: string;
    authorId: number;
    favoritedBy: Set<number>;
}
