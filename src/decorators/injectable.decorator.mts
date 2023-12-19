import { simpleDecoratorFactory } from "../utils/index.mjs";
import { InjectableData, InjectData, SparkusClass, SparkusDataType, SparkusObject } from "../types/index.mjs";

export function Injectable(name?: string): ClassDecorator {
    return ((sparkusClass: SparkusClass): void => {
        const controller: SparkusObject<InjectableData> =
            simpleDecoratorFactory<InjectableData>(
                sparkusClass,
                SparkusDataType.Injectable,
            );

        controller.data.injectable = {
            name: name ?? sparkusClass.name
        };
    }) as ClassDecorator;
}

// Make @InjectAll: ClassDecorator to inject automatically all field
export function Inject(name?: string): PropertyDecorator {
    return (target: any, key: string) => {
        const motherClass: SparkusObject<Array<InjectData>> = simpleDecoratorFactory<any>(target.constructor, SparkusDataType.Inject);

        if (!motherClass.data.injects) {
            motherClass.data.injects = new Array<InjectData>();
        }

        motherClass.data.injects.push({
            varName: key,
            target: name ?? key
        });
    }
}


