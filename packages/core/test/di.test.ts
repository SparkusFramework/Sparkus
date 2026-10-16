import { describe, expect, test } from "bun:test";
import { Container, inject, token, type OnInit, type OnShutdown } from "../src/index.js";

describe("Container", () => {
    test("singletons", () => {
        class Service {}
        class Consumer {
            a = inject(Service);
            b = inject(Service);
        }
        const container = new Container();
        const consumer = container.get(Consumer);
        expect(consumer.a).toBe(consumer.b);
        expect(container.get(Service)).toBe(consumer.a);
    });

    test("inject() outside a construction is SPK1001", () => {
        class Service {}
        expect(() => inject(Service)).toThrow("[SPK1001]");
    });

    test("cycles are reported with their full path", () => {
        class A {
            b: unknown = inject(B);
        }
        class B {
            c: unknown = inject(C);
        }
        class C {
            a = inject(A);
        }
        expect(() => new Container().get(A)).toThrow("[SPK1002] Dependency cycle: A -> B -> C -> A");
    });

    test("a failing constructor names the dependency path", () => {
        class Database {
            constructor() {
                throw new Error("connection refused");
            }
        }
        class Repository {
            db = inject(Database);
        }
        expect(() => new Container().get(Repository)).toThrow(
            "[SPK1009] Could not construct Database (Repository -> Database): connection refused",
        );
    });

    test("tokens: factory default, provider override, missing provider", () => {
        const PORT = token<number>("PORT", () => 3000);
        const SECRET = token<string>("SECRET");
        expect(new Container().get(PORT)).toBe(3000);

        const container = new Container();
        container.provide({ provide: PORT, useValue: 8080 });
        expect(container.get(PORT)).toBe(8080);

        expect(() => new Container().get(SECRET)).toThrow("[SPK1013]");
    });

    test("providers: useClass and useFactory can inject", () => {
        class Clock {
            now() {
                return 1;
            }
        }
        class FakeClock extends Clock {
            override now() {
                return 2;
            }
        }
        const LABEL = token<string>("LABEL");
        const container = new Container();
        container.provide({ provide: Clock, useClass: FakeClock });
        container.provide({ provide: LABEL, useFactory: () => `t=${inject(Clock).now()}` });
        expect(container.get(LABEL)).toBe("t=2");
    });

    test("a provider registered after resolution is SPK1010", () => {
        class Service {}
        const container = new Container();
        container.get(Service);
        expect(() => container.provide({ provide: Service, useValue: new Service() })).toThrow("[SPK1010]");
    });

    test("lifecycle: onInit dependencies first, onShutdown reverse, errors collected", async () => {
        const log: string[] = [];
        class Db implements OnInit, OnShutdown {
            async onInit() {
                await Bun.sleep(1);
                log.push("db up");
            }
            onShutdown() {
                log.push("db down");
                throw new Error("db shutdown failed");
            }
        }
        class Repo implements OnInit, OnShutdown {
            db = inject(Db);
            onInit() {
                log.push("repo up");
            }
            onShutdown() {
                log.push("repo down");
            }
        }
        const container = new Container();
        container.get(Repo);
        await container.init();
        const errors = await container.shutdown();
        expect(log).toEqual(["db up", "repo up", "repo down", "db down"]);
        expect(errors).toHaveLength(1);
    });

    test("useValue instances are not managed", async () => {
        let called = false;
        class Db implements OnInit {
            onInit() {
                called = true;
            }
        }
        const container = new Container();
        container.provide({ provide: Db, useValue: new Db() });
        container.get(Db);
        await container.init();
        expect(called).toBe(false);
    });

    test("a service with onInit resolved after startup is SPK1011", async () => {
        class Late implements OnInit {
            onInit() {}
        }
        const container = new Container();
        await container.init();
        expect(() => container.get(Late)).toThrow("[SPK1011]");
    });
});
