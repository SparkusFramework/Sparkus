import { simpleDecoratorFactory } from "../utils/index.mjs";
import { SparkusDataType } from "../types/index.mjs";
export function Injectable(name) {
    return ((sparkusClass) => {
        const controller = simpleDecoratorFactory(sparkusClass, SparkusDataType.Injectable);
        controller.data.injectable = {
            name: name ?? sparkusClass.name
        };
    });
}
export function Inject(name) {
    return (target, key) => {
        const motherClass = simpleDecoratorFactory(target.constructor, SparkusDataType.Other);
        if (!motherClass.data.injects) {
            motherClass.data.injects = [];
        }
        motherClass.data.injects.push({
            key,
            target: name ?? key
        });
    };
}
