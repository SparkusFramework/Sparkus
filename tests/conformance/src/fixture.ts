// The app every engine must serve identically. Each route exercises one
// behavior; test/conformance.test.ts holds the expected responses.
import {
    Controller,
    Delete,
    Get,
    HttpError,
    Post,
    Put,
    UseGuards,
    UseInterceptors,
    inject,
    t,
    token,
    type AppOptions,
    type Ctx,
    type Guard,
    type Interceptor,
    type InterceptorFn,
    type Next,
    type OnInit,
    type OnShutdown,
} from "sparkus";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lifecycle hooks and logged errors, in order. */
export const events: string[] = [];

export const GREETING = token<string>("GREETING", () => "hello");

export class Clock implements OnInit, OnShutdown {
    onInit() {
        events.push("Clock.onInit");
    }
    onShutdown() {
        events.push("Clock.onShutdown");
        // Clock is built first, so it shuts down last: report the whole sequence to the parent test.
        if (process.env.SPARKUS_FIXTURE_REPORT) process.stdout.write(JSON.stringify({ events }) + "\n");
    }
}

export class UserService implements OnInit, OnShutdown {
    private readonly clock = inject(Clock);
    ready = false;

    async onInit() {
        await delay(5);
        this.ready = this.clock !== undefined;
        events.push("UserService.onInit");
    }

    onShutdown() {
        events.push("UserService.onShutdown");
    }

    find(id: string) {
        return { id, name: "User " + id };
    }
}

class MappedError extends Error {}

class AuthGuard implements Guard {
    private readonly users = inject(UserService);

    canActivate(ctx: Ctx) {
        const header = ctx.header("authorization");
        if (header === undefined) throw HttpError.unauthorized("Missing token.", { code: "NO_TOKEN" });
        if (header !== "Bearer admin" || !this.users.ready) return false;
        ctx.state.user = "admin";
        return true;
    }
}

const allowUnlessDenied = async (ctx: Ctx) => ctx.query.deny === undefined;

function track(ctx: Ctx, step: string) {
    ((ctx.state.order ??= []) as string[]).push(step);
}

const appInterceptor: InterceptorFn = (ctx, next) => {
    track(ctx, "app");
    return next();
};

class ControllerInterceptor implements Interceptor {
    intercept(ctx: Ctx, next: Next) {
        track(ctx, "controller");
        return next();
    }
}

const envelope: InterceptorFn = async (_ctx, next) => ({ data: await next() });

const markHeader: InterceptorFn = (ctx, next) => {
    ctx.setHeader("x-intercepted", "1");
    return next();
};

const CreateUser = {
    body: t.object({
        name: t.string({ min: 1, max: 100 }),
        age: t.integer({ min: 0, max: 150 }),
        tags: t.optional(t.array(t.string())),
    }),
    status: 201,
};

const RenameUser = { body: t.object({ name: t.string({ min: 1 }) }) };

@Controller()
class RootController {
    private readonly greeting = inject(GREETING);
    private readonly users = inject(UserService);

    @Get("/")
    hello() {
        return { hello: "world" };
    }

    @Get("/greeting")
    greet() {
        return { greeting: this.greeting, ready: this.users.ready };
    }

    @Get("/text")
    text() {
        return "plain text";
    }

    @Get("/empty")
    empty() {}

    @Get("/created-empty", { status: 201 })
    createdEmpty() {}

    @Post("/accepted", { status: 202 })
    accepted() {
        return { ok: true };
    }

    @Get("/status")
    teapot(ctx: Ctx) {
        ctx.status = 418;
        ctx.setHeader("X-Custom", "yes");
        return { teapot: true };
    }

    @Get("/null")
    nothing() {
        return null;
    }

    @Get("/bytes")
    bytes() {
        return new Uint8Array([1, 2, 3]);
    }

    @Get("/response")
    response(): Response {
        return new Response("raw", { status: 207, headers: { "x-raw": "1" } });
    }

    @Get("/boom")
    boom() {
        throw new Error("database password is hunter2");
    }

    @Get("/boom-async")
    async boomAsync() {
        await delay(1);
        throw new Error("async failure");
    }

    @Get("/http-error")
    conflict() {
        throw HttpError.conflict("Already exists.", { code: "USER_EXISTS", extensions: { field: "email" } });
    }

    @Get("/mapped")
    mapped() {
        throw new MappedError("mapped");
    }

    @Get("/slow")
    async slow() {
        await delay(300);
        return { slow: true };
    }

    @Get("/hang")
    async hang() {
        await delay(5_000);
        return { hang: true };
    }

    @Get("/query")
    query(ctx: Ctx) {
        const q = ctx.query;
        return { keys: Object.keys(q), values: Object.values(q), inherited: typeof (q as any).hasOwnProperty };
    }
}

@Controller("/users")
class UserController {
    private readonly users = inject(UserService);

    @Get("/me")
    me() {
        return { me: true };
    }

    @Get("/:id")
    get(ctx: Ctx) {
        const id = ctx.params.id!;
        if (id === "0") throw HttpError.notFound(`User ${id} not found.`);
        return { ...this.users.find(id), fields: ctx.query.fields ?? null };
    }

    @Delete("/:id")
    remove(ctx: Ctx) {
        return { deleted: ctx.params.id };
    }

    @Put("/:id", RenameUser)
    rename(ctx: Ctx<typeof RenameUser>) {
        return { id: ctx.params.id, name: ctx.body.name };
    }

    @Get("/:id/async")
    async getAsync(ctx: Ctx) {
        await delay(1);
        return { id: ctx.params.id, agent: ctx.header("x-agent") ?? null };
    }

    @Get("/:id/posts/:postId")
    post(ctx: Ctx) {
        return { ...ctx.params };
    }

    @Post("", CreateUser)
    create(ctx: Ctx<typeof CreateUser>) {
        // Compile-time check: the body type is inferred from the schema.
        const name: string = ctx.body.name;
        const tags: string[] | undefined = ctx.body.tags;
        return { id: 1, name, age: ctx.body.age, tags: tags ?? [] };
    }
}

@Controller("/files")
class FileController {
    @Get("/static/meta")
    meta() {
        return { kind: "meta" };
    }

    @Get("/:name/raw")
    raw(ctx: Ctx) {
        return { raw: ctx.params.name };
    }
}

@Controller("/admin")
@UseGuards(AuthGuard)
@UseInterceptors(ControllerInterceptor)
class AdminController {
    @Get("/me")
    me(ctx: Ctx) {
        return { user: ctx.state.user, order: ctx.state.order };
    }

    @Get("/async-guard")
    @UseGuards(allowUnlessDenied)
    asyncGuard() {
        return { ok: true };
    }

    @Get("/wrapped")
    @UseInterceptors(envelope, markHeader)
    wrapped() {
        return { value: 42 };
    }
}

const TypedPost = {
    params: t.object({ id: t.integer({ min: 1 }) }),
    query: t.object({ page: t.optional(t.integer({ min: 1 })), draft: t.optional(t.boolean()) }),
};

// Guards run after params and query are converted.
const paramsAreTyped = (ctx: Ctx) => typeof (ctx.params as Record<string, unknown>).id === "number";

@Controller("/typed")
class TypedController {
    @Get("/:id", TypedPost)
    @UseGuards(paramsAreTyped)
    get(ctx: Ctx<typeof TypedPost>) {
        const id: number = ctx.params.id;
        return { id, page: ctx.query.page ?? null, draft: ctx.query.draft ?? null, pageType: typeof ctx.query.page };
    }
}

const Profile = {
    body: t.object({
        name: t.string(),
        address: t.optional(t.object({ city: t.string() })),
        links: t.optional(t.array(t.object({ url: t.string() }))),
        tags: t.optional(t.array(t.string())),
    }),
};

const PublicUser = {
    response: t.object({
        id: t.integer(),
        name: t.string(),
        nickname: t.optional(t.string()),
        address: t.object({ city: t.string() }),
        roles: t.array(t.object({ name: t.string() })),
    }),
};

/** What a database would return: more than the API may show. */
function loadEntity() {
    return {
        id: 1,
        name: "Ada",
        passwordHash: "$argon2id$secret",
        address: { city: "London", street: "12 private road" },
        roles: [
            { name: "admin", grantedBy: "root" },
            { name: "author", grantedBy: "admin" },
        ],
    };
}

@Controller("/schema")
class SchemaController {
    @Post("/body", Profile)
    body(ctx: Ctx<typeof Profile>) {
        return { keys: Object.keys(ctx.body), body: ctx.body, prototype: Object.getPrototypeOf(ctx.body) === Object.prototype };
    }

    @Get("/entity", PublicUser)
    entity() {
        return loadEntity();
    }

    @Get("/entity-async", PublicUser)
    async entityAsync() {
        await delay(1);
        return loadEntity();
    }

    @Get("/entity-wrapped", PublicUser)
    @UseInterceptors(envelope)
    entityWrapped() {
        return loadEntity();
    }

    @Get("/entity-raw", PublicUser)
    entityRaw(): Response {
        return new Response('{"raw":true}', { headers: { "content-type": "application/json" } });
    }

    @Get("/mismatch", PublicUser)
    mismatch() {
        // A cast hides the bug from the compiler; the projection still refuses to guess.
        return { ...loadEntity(), roles: "admin" } as unknown as ReturnType<typeof loadEntity>;
    }
}

export const controllers = [RootController, UserController, FileController, AdminController, TypedController, SchemaController];

export function fixtureOptions(): Omit<AppOptions, "engine"> {
    return {
        controllers,
        interceptors: [appInterceptor],
        onError: (error) => (error instanceof MappedError ? HttpError.conflict("Mapped by onError.") : undefined),
        exposeErrors: true,
        bodyLimit: 1024,
        logger: { error: (message) => void events.push(`log: ${message}`) },
    };
}
