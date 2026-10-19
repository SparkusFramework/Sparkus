import { Controller, Get } from "sparkus";

// Not in a *.controller.ts file: never discovered, /hidden is a 404 on every engine.
@Controller("/hidden")
export class HiddenController {
    @Get()
    get() {
        return "found";
    }
}
