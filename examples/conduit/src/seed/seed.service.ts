import { Logger, inject } from "sparkus";
import { ArticleService } from "../articles/articles.service.ts";
import { hashPassword } from "../auth/password.ts";
import { CommentService } from "../comments/comments.service.ts";
import { AppConfig } from "../config.ts";
import { ProfileService } from "../profiles/profiles.service.ts";
import type { User } from "../users/user.ts";
import { UserService } from "../users/users.service.ts";

const USERS = 10;
const BODY = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(18).trim(); // ~1 KB

// Fills the store for load tests when CONDUIT_SEED > 0. ArticleController injects it so that it exists at startup.
export class SeedService {
    private readonly count = inject(AppConfig).CONDUIT_SEED;
    private readonly log = inject(Logger).child("seed");
    private readonly users = inject(UserService);
    private readonly profiles = inject(ProfileService);
    private readonly articles = inject(ArticleService);
    private readonly comments = inject(CommentService);

    onInit(): void {
        if (this.count === 0) return;
        const started = performance.now();
        this.seed(this.count);
        this.log.info("Seeded", { users: USERS, articles: this.count, ms: Math.round(performance.now() - started) });
    }

    seed(articleCount: number): void {
        const hash = hashPassword("password");
        const users: User[] = [];
        for (let i = 0; i < USERS; i++) users.push(this.users.insert(`user${i}`, `user${i}@conduit.test`, hash));
        for (let i = 0; i < USERS; i++) {
            this.profiles.follow(users[i]!, users[(i + 1) % USERS]!);
            this.profiles.follow(users[i]!, users[(i + 2) % USERS]!);
        }
        for (let i = 0; i < articleCount; i++) {
            const author = users[i % USERS]!;
            const article = this.articles.create(author, {
                title: `Article ${i}`,
                description: `Description of article ${i}`,
                body: BODY,
                tagList: [`tag${i % 10}`, `tag${(i + 3) % 10}`, `tag${(i + 7) % 10}`],
            });
            for (let c = 1; c <= 3; c++) this.comments.add(article, users[(i + c) % USERS]!, `Comment ${c} on article ${i}`);
            for (let f = 0; f < i % 4; f++) this.articles.favorite(article.slug, users[(i + 4 + f) % USERS]!);
        }
    }
}
