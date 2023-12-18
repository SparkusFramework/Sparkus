var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Logger } from "../utils/index.mjs";
import { SparkusDataType } from "../types/index.mjs";
import path from "node:path";
import * as fs from "fs";
import { Server } from "./server.mjs";
import { Router } from "./router.mjs";
import * as url from "url";
import { Watcher } from "../utils/watcher.mjs";
import { InjectLoggerClass } from "../decorators/logger.decorator.mjs";
let App = class App {
    scan;
    port;
    server;
    router;
    watcher;
    isWatcherEnabled = false;
    urlControllerMap = new Map(); // TODO => ControllerManager
    injectableMap = new Map(); // TODO: => InjectableManager
    logger;
    constructor(config) {
        const cwd = config.cwd ?? url.pathToFileURL(process.cwd() + "/");
        this.scan = config.scan.map((value) => new URL(value, cwd));
        this.port = config.port ?? 8080;
        if (config.logger)
            Logger.level = config.logger.level;
        this.isWatcherEnabled = config.watch;
        this.watcher = new Watcher(config.scan, config.cwd);
        this.router = new Router();
        this.server = new Server(this.port, this.router);
    }
    async start() {
        const before = Date.now();
        // Initialize the watcher if enabled
        if (this.isWatcherEnabled) {
            this.watcher.init(this);
        }
        // Scan all the files and get all routes asynchronously
        const loadPromises = [];
        for (const url of this.scan) { // TODO: sort to add Injectable before
            this.logger.debug(`Starting scan search on "${url}"`);
            const promises = this.scanFolder(url);
            loadPromises.push(...promises);
        }
        await Promise.all(loadPromises);
        // Start listening with the configured SparkusServer
        this.server.listen();
        this.logger.debug(`Server started in "${Date.now() - before}ms"`);
    }
    scanFolder(url) {
        const loadPromises = [];
        let files;
        try {
            files = fs.readdirSync(url);
        }
        catch (e) {
            this.logger.warn(`Directory at "${url}" not exist.`);
            return loadPromises;
        }
        files.forEach((file) => {
            const fileUrl = new URL(path.join(url.toString(), file));
            if (fs.lstatSync(fileUrl).isDirectory()) {
                const promises = this.scanFolder(fileUrl);
                loadPromises.push(...promises);
            }
            else {
                const promise = this.loadFile(fileUrl).then(({ isLoaded, name }) => {
                    if (!isLoaded) {
                        this.logger.warn(`File can't load (not a valid Sparkus class): "${fileUrl}"`);
                    }
                    else {
                        this.logger.info(`Component "${name}" successfully added.`);
                    }
                });
                loadPromises.push(promise);
            }
        });
        return loadPromises;
    }
    async unloadFile(url) {
        // TODO: add injectable or find better solution for scalability
        const controller = this.urlControllerMap.get(url.pathname);
        if (controller) {
            this.router.removeController(controller);
            return true;
        }
        return true;
    }
    async loadFile(file) {
        this.logger.debug(`Loading file "${file}"...`);
        if (file.pathname.endsWith(".d.ts") || file.pathname.endsWith(".d.mts"))
            return { isLoaded: false };
        const imported = this.isWatcherEnabled
            ? await this.watcher.dynamicImport(file)
            : (await import(file.toString())).default;
        if (!imported)
            return { isLoaded: false };
        const Class = new imported().constructor;
        const sparkusDatas = Class._sparkus;
        // TODO: Make an utils to automaticaly take the sparkus data and type it
        for (const sparkusData of sparkusDatas) {
            if (!sparkusData)
                return { isLoaded: false };
            // TODO: When the Injectable is changed, update the linked file
            if (sparkusData.data.injects) {
                sparkusData.data.injects.forEach(({ key, target }) => {
                    Class[key] = this.injectableMap.get(target);
                });
            }
            // TODO: Find a solution to make the type scalable and not dirty
            if (sparkusData.type === SparkusDataType.Controller) {
                const controller = sparkusData.data.controller;
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
                this.urlControllerMap.set(file.pathname, controller);
                return { isLoaded: true, name: controller.name };
            }
            else if (sparkusData.type === SparkusDataType.Injectable) {
                const injectable = sparkusData.data.injectable;
                this.injectableMap.set(injectable.name, Class.prototype);
                return { isLoaded: true, name: injectable.name };
            }
        }
        return { isLoaded: false };
    }
};
App = __decorate([
    InjectLoggerClass(),
    __metadata("design:paramtypes", [Object])
], App);
export { App };
