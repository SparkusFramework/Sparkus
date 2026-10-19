import { Controller, Get } from "../../../../src/index.js";

// Two controllers in one file; default exports count too.
@Controller("/version")
export class VersionController {
    @Get()
    get() {
        return { version: 1 };
    }
}

@Controller("/ping")
export default class PingController {
    @Get()
    get() {
        return "pong";
    }
}
