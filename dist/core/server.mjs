var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { InjectLogger } from "../decorators/index.mjs";
import { Router } from "./router.mjs";
import * as http from "http";
let Server = class Server {
    port;
    router;
    logger;
    constructor(port, router) {
        this.port = port;
        this.router = router;
    }
    listen() {
        const server = this.createBasicServer();
        server.on("request", (req, res) => {
            const before = Date.now();
            const response = this.router.execute(req, false);
            res.statusCode = response.status;
            res.setHeader("Content-Type", response.type);
            res.end(response.message);
            this.logger.debug(`Request "${req.url}" processed in ${Date.now() - before}ms`);
        });
        server.on("error", (err) => {
            this.logger.error(`Server error: ${err}`);
        });
        server.listen(this.port, () => {
            this.logger.info(`Server is running on port ${this.port}`);
        });
    }
    // TODO
    createSecuredServer() {
        return null;
    }
    createBasicServer() {
        return http.createServer();
    }
};
Server = __decorate([
    InjectLogger,
    __metadata("design:paramtypes", [Number, Router])
], Server);
export { Server };
