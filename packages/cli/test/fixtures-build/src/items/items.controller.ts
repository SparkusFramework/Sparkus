import { Controller, Get } from "sparkus";

@Controller("/items")
export class ItemController {
    @Get()
    list() {
        return [];
    }
}
