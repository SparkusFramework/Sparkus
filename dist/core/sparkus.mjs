var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var Sparkus_1;
import { SparkusLogger } from "../utils/index.mjs";
import { Logger } from "../decorators/index.mjs";
import path from "node:path";
import * as fs from "fs";
import { SparkusServer } from "./server.mjs";
import { SparkusRouter } from "./router.mjs";
export var SparkusDataType;
(function (SparkusDataType) {
    SparkusDataType[SparkusDataType["Controller"] = 0] = "Controller";
    SparkusDataType[SparkusDataType["Service"] = 1] = "Service";
    SparkusDataType[SparkusDataType["Endpoint"] = 2] = "Endpoint";
})(SparkusDataType || (SparkusDataType = {}));
let Sparkus = Sparkus_1 = class Sparkus {
    scan;
    port;
    server;
    router;
    logger;
    constructor(config) {
        this.scan = config.scan;
        this.port = config.port ?? 8080;
        SparkusLogger.level = config.logger.level;
        this.router = new SparkusRouter();
        this.server = new SparkusServer(this.port, this.router);
    }
    async start() {
        const before = Date.now();
        this.logger.debug(`Starting reflection search on "${this.scan}"`);
        // Scan all the files and get all routes
        for (const url of this.scan) {
            await Sparkus_1.reflectionSearch(url, this.logger, this.router);
        }
        // Start listening with the configured SparkusServer
        this.server.listen();
        this.logger.debug(`Server started in "${Date.now() - before}ms"`);
    }
    // TODO: Load in async to parallelize + clean
    static async reflectionSearch(url, logger, router) {
        const files = fs.readdirSync(url);
        for (const file of files) {
            const fileUrl = new URL(path.join(url.toString(), file));
            if (fs.lstatSync(fileUrl).isDirectory()) {
                await this.reflectionSearch(new URL(fileUrl), logger, router);
            }
            else {
                logger.debug(`Loading file: "${fileUrl}"`);
                const imported = await import(fileUrl.toString());
                const loadedClass = new (imported.default)();
                const sparkusData = loadedClass._sparkus;
                if (sparkusData) {
                    if (sparkusData.type === SparkusDataType.Controller) {
                        logger.debug(`Loading controller "${sparkusData.data.name}"...`);
                        const methods = Object.getOwnPropertyDescriptors(loadedClass.constructor.prototype);
                        Object.keys(methods).forEach((methodName) => {
                            if (methods[methodName].value._sparkus) {
                                let data = methods[methodName].value._sparkus;
                                const isEndpoint = data.type === SparkusDataType.Endpoint;
                                if (isEndpoint) {
                                    const endpoint = data.data;
                                    const endpointPath = endpoint.path.startsWith('/') ? endpoint.path.substring(1) : endpoint.path;
                                    const path = sparkusData.data.path
                                        + (endpoint.path.trim().length !== 0 ? '/' : '')
                                        + endpointPath;
                                    router.addRoute(path, methods[methodName].value, loadedClass, endpoint.method);
                                    logger.debug(`Route with path "${sparkusData.data.path}/${data.data.path}" added.`);
                                }
                            }
                        });
                    }
                }
                else {
                    logger.warn(`Invalid SparkusData object in file: "${fileUrl}"`);
                }
            }
        }
    }
};
Sparkus = Sparkus_1 = __decorate([
    Logger,
    __metadata("design:paramtypes", [Object])
], Sparkus);
export { Sparkus };
