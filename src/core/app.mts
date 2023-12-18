import { Logger, SparkusLoggerLevel } from "../utils/index.mjs";
import {
    ControllerData,
    DefaultClass,
    EndpointData,
    InjectableData, SparkusClass,
    SparkusDataType,
    SparkusObject
} from "../types/index.mjs";

import path from "node:path";
import * as fs from "fs";
import { Server } from "./server.mjs";
import { Router } from "./router.mjs";
import * as url from "url";
import { Watcher } from "../utils/watcher.mjs";
import { InjectLoggerClass } from "../decorators/logger.decorator.mjs";

interface BootstrapConfig {
    scan: string[];
    port?: number;
    logger?: {
        level?: SparkusLoggerLevel;
    };
    watch?: boolean;
    cwd?: string;
}

@InjectLoggerClass()
export class App {

    private readonly scan: URL[];
    private readonly port: number;
    private readonly server: Server;
    private readonly router: Router;
    private readonly watcher: Watcher;
    private readonly isWatcherEnabled: boolean = false;
    private readonly urlControllerMap: Map<string, ControllerData> =
        new Map<string, ControllerData>(); // TODO => ControllerManager
    private readonly injectableMap: Map<string, SparkusClass> =
        new Map<string, SparkusClass>(); // TODO: => InjectableManager

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

        // Start listening with the configured SparkusServer
        this.server.listen();

       this.logger.debug(`Server started in "${Date.now() - before}ms"`);
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
                const promise = this.loadFile(fileUrl).then(
                    ({ isLoaded, name }) => {
                        if (!isLoaded) {
                            this.logger.warn(`File can't load (not a valid Sparkus class): "${fileUrl}"`,);
                        } else {
                            this.logger.info(`Component "${name}" successfully added.`,);
                        }
                    },
                );

                loadPromises.push(promise);
            }
        });

        return loadPromises;
    }

    async unloadFile(url: URL): Promise<boolean> {
        // TODO: add injectable or find better solution for scalability
        const controller = this.urlControllerMap.get(url.pathname);

        if (controller) {
            this.router.removeController(controller);
            return true;
        }

        return true;
    }

    async loadFile(
        file: URL,
    ): Promise<{ isLoaded: boolean; name?: string }> {
       this.logger.debug(`Loading file "${file}"...`);

        if (file.pathname.endsWith(".d.ts") || file.pathname.endsWith(".d.mts"))
            return { isLoaded: false };

        const imported = this.isWatcherEnabled
            ? await this.watcher.dynamicImport(file)
            : (await import(file.toString())).default;

        if (!imported) return { isLoaded: false };

        const Class = new imported().constructor;
        const sparkusDatas: SparkusObject[] = Class._sparkus;

        // TODO: Make an utils to automaticaly take the sparkus data and type it
        for (const sparkusData of sparkusDatas) {
            if (!sparkusData) return { isLoaded: false };

            // TODO: When the Injectable is changed, update the linked file
            if (sparkusData.data.injects) {
                sparkusData.data.injects.forEach(({ key, target }: { key: string, target: string }) => {
                    Class[key] =  this.injectableMap.get(target);
                })
            }

            // TODO: Find a solution to make the type scalable and not dirty
            if (sparkusData.type === SparkusDataType.Controller) {
                const controller = sparkusData.data.controller as ControllerData;

                this.logger.debug(`Loading controller "${controller.name}"...`);

                const methods = Object.getOwnPropertyDescriptors(
                    controller.constructor.prototype,
                );

                Object.keys(methods).forEach((methodName: string) => {
                    if (methods[methodName].value._sparkus) {
                        let methodData: SparkusObject =
                            methods[methodName].value._sparkus[0]; // TODO: for each

                        const isEndpoint =
                            methodData.type === SparkusDataType.Endpoint;

                        if (isEndpoint) {
                            const endpoint = methodData.data.endpoint as EndpointData;
                            controller.endpoints.push(endpoint);
                        }
                    }
                });

                this.router.addController(controller);
                this.urlControllerMap.set(file.pathname, controller);

                return { isLoaded: true, name: controller.name };
            } else if (sparkusData.type === SparkusDataType.Injectable) {
                const injectable = sparkusData.data.injectable as InjectableData;
                this.injectableMap.set(injectable.name, Class.prototype);
                return { isLoaded: true, name: injectable.name };
            }
        }

        return { isLoaded: false };
    }
}
