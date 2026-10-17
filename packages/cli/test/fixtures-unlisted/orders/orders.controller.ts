import { Controller, Get } from "sparkus";

// Written, but never added to controllers in app.ts.
@Controller("/orders")
export class Orders {
    @Get("")
    list() {
        return [];
    }
}
