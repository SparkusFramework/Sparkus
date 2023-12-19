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
// Make @InjectAll: ClassDecorator to inject automatically all field
export function Inject(name) {
    return (target, key) => {
        const motherClass = simpleDecoratorFactory(target.constructor, SparkusDataType.Inject);
        if (!motherClass.data.injects) {
            motherClass.data.injects = new Array();
        }
        motherClass.data.injects.push({
            varName: key,
            target: name ?? key
        });
    };
}
