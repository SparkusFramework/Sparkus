import { Logger } from "../utils/index.mjs";
/**
 * Provide a new autoconfigured logger to the class.
 *
 * @param constructor
 */
export declare function InjectLogger<T extends {
    new (...args: any[]): {};
}>(constructor: T): {
    new (...args: any[]): {
        logger: Logger;
    };
} & T;
