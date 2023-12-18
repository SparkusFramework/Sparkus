import { SparkusLoggerLevel } from "../utils/index.mjs";
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
    private readonly injectableMap;
    private logger;
    constructor(config: BootstrapConfig);
    start(): Promise<void>;
    private scanFolder;
    unloadFile(url: URL): Promise<boolean>;
    loadFile(file: URL): Promise<{
        isLoaded: boolean;
        name?: string;
    }>;
}
export {};
