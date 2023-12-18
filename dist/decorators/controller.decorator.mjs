import { SparkusDataType, } from "../types/index.mjs";
import { simpleDecoratorFactory } from "../utils/decorator.mjs";
export function Controller(path) {
    return ((sparkusClass) => {
        const controller = simpleDecoratorFactory(sparkusClass, SparkusDataType.Controller);
        if (controller['INJECT_LOGGER']) {
            console.log("test");
        }
        controller.data.controller = {
            path: path ?? "/",
            name: sparkusClass.name,
            endpoints: [],
            constructor: sparkusClass,
        };
    });
}
