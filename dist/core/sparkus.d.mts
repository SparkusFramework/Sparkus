import { SparkusLoggerLevel } from "../utils/index.mjs";
export declare enum SparkusDataType {
    Controller = 0,
    Service = 1,
    Endpoint = 2,
}
export interface SparkusClass extends Function {
    _sparkus: SparkusData;
    constructor: any;
}
export interface SparkusData {
    type: SparkusDataType;
    data: any;
}
interface BootstrapConfig {
    scan: string[];
    port?: number;
    logger?: {
        level?: SparkusLoggerLevel;
    };
    watch?: boolean;
    cwd?: string;
}
export declare class App {
    private readonly scan;
    private readonly port;
    private readonly server;
    private readonly router;
    private readonly watcher;
    private readonly isWatcherEnabled;
    private readonly urlControllerMap;
    private logger;
    constructor(config: BootstrapConfig);
    start(): Promise<void>;
    private scanFolder;
    unloadFile(url: URL): Promise<boolean>;
    loadFile(file: URL): Promise<boolean>;
}
export {};
