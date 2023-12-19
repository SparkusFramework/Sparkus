import { Logger, SparkusLoggerLevel, Watcher } from "../utils/index.mjs";
import { SparkusDataType, SparkusObject } from "../types/index.mjs";
import { InitLoggerClass } from "../decorators/index.mjs";
import { ControllerManager } from "./managers/controller.manager.mjs";
import { InjectableManager } from "./managers/injectable.manager.mjs";

import path from "node:path";
import * as fs from "fs";
import { Server } from "./server.mjs";
import { Router } from "./router.mjs";
import * as url from "url";

interface BootstrapConfig {
    scan: string[];
    port?: number;
    logger?: {
        level?: SparkusLoggerLevel;
    };
    watch?: boolean;
    cwd?: string;
}

@InitLoggerClass()
export class App {

    private readonly scan: URL[];
    private readonly port: number;
    private readonly server: Server;
    private readonly router: Router;
    private readonly watcher: Watcher;
    private readonly isWatcherEnabled: boolean = false;
    private readonly controllerManager: ControllerManager;
    private readonly _injectableManager: InjectableManager;

    private logger: Logger;

    constructor(config: BootstrapConfig) {
        const cwd = config.cwd ?? url.pathToFileURL(process.cwd() + "/");

        this.scan = config.scan.map((value) => new URL(value, cwd));
        this.port = config.port ?? 8080;

        if (config.logger) Logger.level = config.logger.level;
        this.isWatcherEnabled = config.watch;

        this.watcher = new Watcher(config.scan, config.cwd);
        this.router = new Router();
        this.server = new Server(this.port, this.router);
        this.controllerManager = new ControllerManager(this.router);
        this._injectableManager = new InjectableManager();
    }

    async start(): Promise<void> {
        const before = Date.now();

        // Initialize the watcher if enabled
        if (this.isWatcherEnabled) {
            this.watcher.init(this);
        }

        // Scan all the files and get all routes asynchronously
        const loadPromises: Promise<void>[] = [];
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

    private scanFolder(url: URL): Promise<void>[] {
        const loadPromises: Promise<void>[] = [];

        let files: string[];
        try {
            files = fs.readdirSync(url);
        } catch (e) {
            this.logger.warn(`Directory at "${url}" not exist.`);
            return loadPromises;
        }

        files.forEach((file) => {
            const fileUrl = new URL(path.join(url.toString(), file));

            if (fs.lstatSync(fileUrl).isDirectory()) {
                const promises = this.scanFolder(fileUrl);
                loadPromises.push(...promises);
            } else {
                const promise = this.loadFile(fileUrl);

                loadPromises.push(promise);
            }
        });

        return loadPromises;
    }

    async unloadFile(url: URL): Promise<boolean> {
        const results: boolean[] = [];

        results.push(await this.controllerManager.unload(url));
        results.push(await this.injectableManager.unload(url));

        return results.find(value => value);
    }

    async loadFile(file: URL): Promise<void> {
        this.logger.debug(`Loading file "${file}"...`);

        if (file.pathname.endsWith(".d.ts") || file.pathname.endsWith(".d.mts")) return;

        const imported = this.isWatcherEnabled
            ? await this.watcher.dynamicImport(file)
            : (await import(file.toString())).default;

        if (!imported) return;

        const Class = new imported().constructor;
        const sparkusDatas: SparkusObject[] = Class._sparkus;

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

    get injectableManager(): InjectableManager {
        return this._injectableManager;
    }
}
