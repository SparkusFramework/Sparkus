import { Logger } from "../utils/index.mjs";

export function InitLoggerClass<T extends { new (...args: any[]): {} }>() {
    return (constructor: T) => {
        const basePrototype = constructor.prototype;

        return {
            [constructor.name]: class extends constructor {
                logger: Logger = new Logger(constructor.name);

                constructor(...args: any[]) {
                    super(...args);

                    // Include all the base methods to the new one
                    Object.getOwnPropertyNames(basePrototype).forEach((key) => {
                        if (typeof basePrototype[key] === "function") {
                            (this as any).constructor.prototype[key] =
                                basePrototype[key];
                        }
                    });
                }
            },
        }[constructor.name];
    };
}


export function InitLogger(name?: string): PropertyDecorator {
    return (target: any, key: string) => {
        Object.defineProperty(target.constructor, key, {
            value: new Logger(name ?? target.constructor.name),
            writable: true,
            enumerable: true,
            configurable: true
        });
    }
}


