import { simpleDecoratorFactory } from "../utils/index.mjs";
import { InjectableData, SparkusClass, SparkusDataType, SparkusObject } from "../types/index.mjs";

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

export function Inject(name?: string): PropertyDecorator {
    return (target: any, key: string) => {
        const motherClass = simpleDecoratorFactory<any>(target.constructor, SparkusDataType.Other);

        if (!motherClass.data.injects) {
            motherClass.data.injects = [];
        }

        motherClass.data.injects.push({
            key,
            target: name ?? key
        });
    }
}


