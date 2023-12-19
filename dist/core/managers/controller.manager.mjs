var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { SparkusDataType } from "../../types/index.mjs";
import { Router } from "../router.mjs";
import { InitLoggerClass } from "../../decorators/index.mjs";
let ControllerManager = class ControllerManager {
    router;
    pathControllerMap = new Map();
    logger;
    constructor(router) {
        this.router = router;
    }
    async load(url, controller) {
        this.logger.debug(`Loading controller "${controller.name}"...`);
        const methods = Object.getOwnPropertyDescriptors(controller.constructor.prototype);
        Object.keys(methods).forEach((methodName) => {
            if (methods[methodName].value._sparkus) {
                let methodData = methods[methodName].value._sparkus[0]; // TODO: for each
                const isEndpoint = methodData.type === SparkusDataType.Endpoint;
                if (isEndpoint) {
                    const endpoint = methodData.data.endpoint;
                    controller.endpoints.push(endpoint);
                }
            }
        });
        this.router.addController(controller);
        this.pathControllerMap.set(url.pathname, controller);
        this.logger.info(`Controller "${controller.name}" successfully added.`);
    }
    async unload(url) {
        const controller = this.pathControllerMap.get(url.pathname);
        if (controller) {
            this.logger.debug(`Unloading controller "${controller.name}"...`);
            this.router.removeController(controller);
            return true;
        }
        return false;
    }
};
ControllerManager = __decorate([
    InitLoggerClass(),
    __metadata("design:paramtypes", [Router])
], ControllerManager);
export { ControllerManager };
