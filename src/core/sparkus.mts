import {SparkusLogger, SparkusLoggerLevel} from "../utils/index.mjs";
import {Logger} from "../decorators/index.mjs";

import path from "node:path";
import * as fs from "fs";
import {SparkusServer} from "./server.mjs";
import {SparkusDataEndpoint, SparkusRouter} from "./router.mjs";

export enum SparkusDataType {
    Controller,
    Service,
    Endpoint
}

export interface SparkusClass extends Function {
    _sparkus: SparkusData,
    constructor: any
}

export interface SparkusData {
    type: SparkusDataType,
    data: any
}

interface SparkusConfig {
    scan: URL[],
    port?: number,
    logger?: {
        level?: SparkusLoggerLevel
    }
}

@Logger
export class Sparkus {

    private readonly scan: URL[];
    private readonly port: number;
    private readonly server: SparkusServer;
    private readonly router: SparkusRouter;

    private logger: SparkusLogger;

    constructor(config: SparkusConfig) {
        this.scan = config.scan;
        this.port = config.port ?? 8080;

        SparkusLogger.level = config.logger.level

        this.router = new SparkusRouter();
        this.server = new SparkusServer(this.port, this.router);
    }

    async start(): Promise<void> {
        const before = Date.now();
        this.logger.debug(`Starting reflection search on "${this.scan}"`);

        // Scan all the files and get all routes
        for (const url of this.scan) {
            await Sparkus.reflectionSearch(url, this.logger, this.router);
        }

        // Start listening with the configured SparkusServer
        this.server.listen();

        this.logger.debug(`Server started in "${Date.now() - before}ms"`);
    }

    // TODO: Load in async to parallelize + clean
    private static async reflectionSearch(url: URL, logger: SparkusLogger, router: SparkusRouter): Promise<void> {
        const files = fs.readdirSync(url);

        for (const file of files) {
            const fileUrl = new URL(path.join(url.toString(), file));

            if (fs.lstatSync(fileUrl).isDirectory()) {
                await this.reflectionSearch(new URL(fileUrl), logger, router);
            } else {
                logger.debug(`Loading file: "${fileUrl}"`)

                const imported = await import(fileUrl.toString());
                const loadedClass: SparkusClass = new (imported.default)();

                const sparkusData: SparkusData = loadedClass._sparkus;

                if (sparkusData) {
                    if (sparkusData.type === SparkusDataType.Controller) {
                        logger.debug(`Loading controller "${sparkusData.data.name}"...`)

                        const methods = Object.getOwnPropertyDescriptors(loadedClass.constructor.prototype);

                        Object.keys(methods).forEach((methodName: string) => {
                            if (methods[methodName].value._sparkus) {
                                let data: SparkusData = methods[methodName].value._sparkus;

                                const isEndpoint = data.type === SparkusDataType.Endpoint;

                                if (isEndpoint) {
                                    const endpoint = data.data as SparkusDataEndpoint;

                                    const endpointPath= endpoint.path.startsWith('/') ? endpoint.path.substring(1) : endpoint.path;

                                    const path = sparkusData.data.path
                                        + (endpoint.path.trim().length !== 0 ? '/' : '')
                                        + endpointPath

                                    router.addRoute(
                                        path,
                                        methods[methodName].value,
                                        loadedClass,
                                        endpoint.method
                                    );

                                    logger.debug(`Route with path "${sparkusData.data.path}/${data.data.path}" added.`);
                                }

                            }
                        });


                    }
                } else {
                    logger.warn(`Invalid SparkusData object in file: "${fileUrl}"`);
                }
            }
        }
    }

}