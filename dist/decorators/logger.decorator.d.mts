import { SparkusLogger } from "../utils/index.mjs";
/**
 * Provide a new autoconfigured logger to the class.
 *
 * @param constructor
 */
export declare function Logger<T extends {
    new (...args: any[]): {};
}>(constructor: T): {
    new (...args: any[]): {
        logger: SparkusLogger;
    };
} & T;
