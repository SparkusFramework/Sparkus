import { Controller, Get } from "sparkus";

@Controller("/items")
export class Items {
    @Get("")
    list() {
        return [];
    }
}
