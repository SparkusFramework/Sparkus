import { SparkusDataType, } from "../types/index.mjs";
import { simpleDecoratorFactory } from "../utils/decorator.mjs";
export function Controller(path) {
    return ((sparkusClass) => {
        const controller = simpleDecoratorFactory(sparkusClass, SparkusDataType.Controller);
        controller.data.controller = {
            path: path ?? "/",
            name: sparkusClass.name,
            endpoints: [],
            constructor: sparkusClass,
        };
    });
}
