import { Controller, Get, createApp, inject } from "sparkus";

class A {
    b: unknown = inject(B);
}
class B {
    a = inject(A);
}

@Controller()
class Root {
    a = inject(A);

    @Get("/")
    get() {}
}

export const app = createApp({ controllers: [Root] });
