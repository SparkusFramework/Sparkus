export declare enum SparkusLoggerLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}
export interface SparkusLoggerConfig {
    name?: string;
}
export declare class Logger {
    static level: SparkusLoggerLevel;
    private readonly name?;
    constructor(config?: SparkusLoggerConfig);
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string, error?: any): void;
}
