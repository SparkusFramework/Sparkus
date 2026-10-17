import { Controller, Delete, Get, Post, Put, createApp, t } from "sparkus";
import { HOST, PORT, RESOURCES, report } from "./routes.js";

const t0 = performance.now();
const method = (name) => ({ kind: "method", name, static: false, private: false, addInitializer() {} });
const klass = (name) => ({ kind: "class", name, addInitializer() {} });

// What the decorators of `@Controller("/rN") class { @Get("/") list() ... }` do, written as calls.
function resource(n) {
    const body = t.object({ name: t.string({ min: 1, max: 100 }), age: t.integer({ min: 0, max: 150 }) });
    class Resource {
        list() {
            return [];
        }
        get(ctx) {
            return { id: ctx.params.id, n };
        }
        create(ctx) {
            return { id: 1, ...ctx.body };
        }
        update(ctx) {
            return { id: ctx.params.id, ...ctx.body };
        }
        remove() {}
    }
    Object.defineProperty(Resource, "name", { value: `Resource${n}` });
    const p = Resource.prototype;
    Get("/")(p.list, method("list"));
    Get("/:id")(p.get, method("get"));
    Post("/", { body, status: 201 })(p.create, method("create"));
    Put("/:id", { body })(p.update, method("update"));
    Delete("/:id")(p.remove, method("remove"));
    Controller(`/r${n}`)(Resource, klass(Resource.name));
    return Resource;
}

class Hello {
    hello() {
        return { hello: "world" };
    }
}
Get("/")(Hello.prototype.hello, method("hello"));
Controller()(Hello, klass("Hello"));

const controllers = [Hello];
for (let n = 0; n < RESOURCES; n++) controllers.push(resource(n));
const t1 = performance.now();
const app = createApp({ controllers });
await app.init();
const t2 = performance.now();
await app.listen({ port: PORT, hostname: HOST, signals: false });
const t3 = performance.now();
report({ declare: t1 - t0, init: t2 - t1, listen: t3 - t2 });
