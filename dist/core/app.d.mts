import { SparkusLoggerLevel } from "../utils/index.mjs";
import { InjectableManager } from "./managers/injectable.manager.mjs";
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
    private readonly controllerManager;
    private readonly _injectableManager;
    private logger;
    constructor(config: BootstrapConfig);
    start(): Promise<void>;
    private scanFolder;
    unloadFile(url: URL): Promise<boolean>;
    loadFile(file: URL): Promise<void>;
    get injectableManager(): InjectableManager;
}
export {};
