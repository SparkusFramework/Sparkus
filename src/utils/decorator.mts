import {
    SparkusClass,
    SparkusDataType, SparkusFunction,
    SparkusObject
} from "../types/index.mjs";


/**
 * Function to initialize a Sparkus decorator.
 *
 * @export
 * @function simpleDecoratorFactory
 * @template T - The generic type representing the structure of the data within the decorator.
 * @param {SparkusClass | SparkusFunction} sparkusFn - The function or class to be decorated.
 * @param {SparkusDataType} type - The type of sparkus data (SparkusDataType).
 * @returns {SparkusObject<T>} - The SparkusObject with the decorated properties from sparkusFn, already
 * set with type and data of type T.
 */
export function simpleDecoratorFactory<T>(
    sparkusFn: SparkusClass | SparkusFunction,
    type: SparkusDataType
): SparkusObject<T> {
    if ("_sparkus" in sparkusFn) {
        return sparkusFn._sparkus;
    } else {
        const sparkusObject: SparkusObject = {
            type,
            data: {} as T
        };

        Object.defineProperty(sparkusFn, "_sparkus", {
            value: sparkusObject,
            writable: true,
            enumerable: true,
            configurable: true
        });

        return sparkusObject;
    }
}
