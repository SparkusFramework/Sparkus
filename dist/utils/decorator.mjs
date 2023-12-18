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
export function simpleDecoratorFactory(sparkusFn, type) {
    if (!("_sparkus" in sparkusFn)) {
        const sparkusObject = {
            type,
            data: {}
        };
        Object.defineProperty(sparkusFn, "_sparkus", {
            value: [sparkusObject],
            writable: true,
            enumerable: true,
            configurable: true
        });
        return sparkusObject;
    }
    const objects = sparkusFn._sparkus;
    const existingObject = objects.find(obj => obj.type === type);
    if (!existingObject) {
        const sparkusObject = {
            type,
            data: {}
        };
        objects.push(sparkusObject);
        return sparkusObject;
    }
    return existingObject;
}
