import { Logger } from "../utils/index.mjs";
export declare function InitLoggerClass<T extends {
    new (...args: any[]): {};
}>(): (constructor: T) => {
    new (...args: any[]): {
        logger: Logger;
    };
} & T;
export declare function InitLogger(name?: string): PropertyDecorator;
