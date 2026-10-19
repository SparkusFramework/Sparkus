import { Controller, Get } from "sparkus";

// Two controllers in one file, one of them the default export.
@Controller("/status")
export class StatusController {
    @Get()
    get() {
        return { ok: true };
    }
}

@Controller("/ping")
export default class PingController {
    @Get()
    get() {
        return "pong";
    }
}
