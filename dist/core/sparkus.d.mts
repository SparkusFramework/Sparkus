import { SparkusLoggerLevel } from "../utils/index.mjs";
export declare enum SparkusDataType {
    Controller = 0,
    Service = 1,
    Endpoint = 2
}
export interface SparkusClass extends Function {
    _sparkus: SparkusData;
    constructor: any;
}
export interface SparkusData {
    type: SparkusDataType;
    data: any;
}
interface SparkusConfig {
    scan: URL[];
    port?: number;
    logger?: {
        level?: SparkusLoggerLevel;
    };
}
export declare class Sparkus {
    private readonly scan;
    private readonly port;
    private readonly server;
    private readonly router;
    private logger;
    constructor(config: SparkusConfig);
    start(): Promise<void>;
    private static reflectionSearch;
}
export {};
