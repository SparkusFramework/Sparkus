import { Controller, Get, inject, t } from "sparkus";
import { ArticleService } from "../articles/articles.service.ts";

const List = { response: t.object({ tags: t.array(t.string()) }) };

@Controller("/api/tags")
export class TagController {
    private readonly articles = inject(ArticleService);

    @Get("", List)
    list() {
        return { tags: this.articles.tags() };
    }
}
