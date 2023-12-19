import { Logger } from "../utils/index.mjs";
export function InitLoggerClass() {
    return (constructor) => {
        const basePrototype = constructor.prototype;
        return {
            [constructor.name]: class extends constructor {
                logger = new Logger(constructor.name);
                constructor(...args) {
                    super(...args);
                    // Include all the base methods to the new one
                    Object.getOwnPropertyNames(basePrototype).forEach((key) => {
                        if (typeof basePrototype[key] === "function") {
                            this.constructor.prototype[key] =
                                basePrototype[key];
                        }
                    });
                }
            },
        }[constructor.name];
    };
}
export function InitLogger(name) {
    return (target, key) => {
        Object.defineProperty(target.constructor, key, {
            value: new Logger(name ?? target.constructor.name),
            writable: true,
            enumerable: true,
            configurable: true
        });
    };
}
