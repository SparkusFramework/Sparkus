import { Logger } from "../utils/index.mjs";
export declare function InjectLoggerClass<T extends {
    new (...args: any[]): {};
}>(): (constructor: T) => {
    new (...args: any[]): {
        logger: Logger;
    };
} & T;
export declare function InjectLogger(name?: string): PropertyDecorator;
