var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Logger, Watcher } from "../utils/index.mjs";
import { SparkusDataType } from "../types/index.mjs";
import { InitLoggerClass } from "../decorators/index.mjs";
import { ControllerManager } from "./managers/controller.manager.mjs";
import { InjectableManager } from "./managers/injectable.manager.mjs";
import path from "node:path";
import * as fs from "fs";
import { Server } from "./server.mjs";
import { Router } from "./router.mjs";
import * as url from "url";
let App = class App {
    scan;
    port;
    server;
    router;
    watcher;
    isWatcherEnabled = false;
    controllerManager;
    _injectableManager;
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
        this.controllerManager = new ControllerManager(this.router);
        this._injectableManager = new InjectableManager();
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
        // Inject all dependencies
        await this.injectableManager.injectAllDependencies();
        // Start listening with the configured SparkusServer
        this.server.listen();
        this.logger.debug(`Server loaded in "${Date.now() - before}ms"`);
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
                const promise = this.loadFile(fileUrl);
                loadPromises.push(promise);
            }
        });
        return loadPromises;
    }
    async unloadFile(url) {
        const results = [];
        results.push(await this.controllerManager.unload(url));
        results.push(await this.injectableManager.unload(url));
        return results.find(value => value);
    }
    async loadFile(file) {
        this.logger.debug(`Loading file "${file}"...`);
        if (file.pathname.endsWith(".d.ts") || file.pathname.endsWith(".d.mts"))
            return;
        const imported = this.isWatcherEnabled
            ? await this.watcher.dynamicImport(file)
            : (await import(file.toString())).default;
        if (!imported)
            return;
        const Class = new imported().constructor;
        const sparkusDatas = Class._sparkus;
        // TODO: Make an utils to automaticaly take the sparkus data and type it
        for (const sparkusData of sparkusDatas) {
            switch (sparkusData.type) {
                case SparkusDataType.Controller:
                    await this.controllerManager.load(file, sparkusData.data.controller);
                    break;
                case SparkusDataType.Injectable:
                    await this.injectableManager.loadInjectable(Class, sparkusData.data.injectable);
                    break;
                case SparkusDataType.Inject:
                    await this.injectableManager.loadInjects(Class, sparkusData.data.injects);
                    break;
            }
        }
    }
    get injectableManager() {
        return this._injectableManager;
    }
};
App = __decorate([
    InitLoggerClass(),
    __metadata("design:paramtypes", [Object])
], App);
export { App };
