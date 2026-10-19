import { Controller, Get } from "../../../../../src/index.js";

// Not in a *.controller.ts file: never discovered, its route is a 404.
@Controller("/admin")
export class AdminController {
    @Get()
    get() {
        return "admin";
    }
}
