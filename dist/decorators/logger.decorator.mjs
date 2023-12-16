import { SparkusLogger } from "../utils/index.mjs";
/**
 * Provide a new autoconfigured logger to the class.
 *
 * @param constructor
 */
// TODO: Delete when AutoInject / Injectab
export function Logger(constructor) {
    const basePrototype = constructor.prototype;
    // TODO: Move that in a DecoratorBuilder
    return {
        [constructor.name]: class extends constructor {
            logger = new SparkusLogger({
                name: constructor.name
            });
            constructor(...args) {
                super(...args);
                // TODO: Move that in a DecoratorBuilder
                // Include all the base methods to the new one
                Object.getOwnPropertyNames(basePrototype).forEach((key) => {
                    if (typeof basePrototype[key] === 'function') {
                        this.constructor.prototype[key] = basePrototype[key];
                    }
                });
            }
        }
    }[constructor.name];
}
