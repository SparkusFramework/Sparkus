import {
    ControllerData,
    EndpointData,
    SparkusClass,
    SparkusDataType,
    SparkusObject,
    Method,
} from "../types/index.mjs";
import { simpleDecoratorFactory } from "../utils/decorator.mjs";

export function Controller(path?: string): ClassDecorator {
    return ((sparkusClass: SparkusClass): void => {
        const controller: SparkusObject<ControllerData> =
            simpleDecoratorFactory<ControllerData>(
                sparkusClass,
                SparkusDataType.Controller,
            );

        if (controller['INJECT_LOGGER']) {
            console.log("test");
        }

        controller.data.controller = {
            path: path ?? "/",
            name: sparkusClass.name,
            endpoints: [],
            constructor: sparkusClass,
        };
    }) as ClassDecorator;
}
