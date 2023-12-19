var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { InitLoggerClass } from "../../decorators/index.mjs";
let InjectableManager = class InjectableManager {
    injectableMap = new Map();
    injects = new Array;
    logger;
    async injectAllDependencies() {
        this.logger.debug(`Starting injection of ${this.injects.length} elements...`);
        this.injects.forEach(({ inject, originClass }) => {
            const classToInject = this.injectableMap.get(inject.target);
            if (classToInject !== undefined) {
                originClass[inject.varName] = classToInject;
            }
            else {
                this.logger.error(`Injectable component "${inject.target}" not found.`);
                throw new Error(`Injectable component "${inject.target}" not found.`);
            }
        });
    }
    async loadInjectable(Class, injectable) {
        this.injectableMap.set(injectable.name, Class.prototype);
        this.logger.info(`Injectable "${injectable.name}" successfully added.`);
    }
    async loadInjects(Class, injects) {
        this.injects.push(...injects.map(value => ({ inject: value, originClass: Class })));
        this.logger.debug(`Variable(s) "${injects.map(value => value.varName).join(",")}" added to be injected in "${Class.name}".`);
    }
    async unload(url) {
        return false;
    }
};
InjectableManager = __decorate([
    InitLoggerClass()
], InjectableManager);
export { InjectableManager };
