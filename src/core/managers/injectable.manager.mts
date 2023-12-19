import {
    ControllerData,
    EndpointData, InjectableData, InjectData,
    LoadStatus,
    SparkusClass,
    SparkusDataType,
    SparkusObject
} from "../../types/index.mjs";
import { Router } from "../router.mjs";
import { InitLoggerClass } from "../../decorators/index.mjs";
import { Logger } from "../../utils/index.mjs";

@InitLoggerClass()
export class InjectableManager {

    private readonly injectableMap: Map<string, SparkusClass> = new Map();
    private readonly injects: Array<{ inject: InjectData, originClass: SparkusClass }>
        = new Array<{ inject: InjectData, originClass: SparkusClass }>;

    private logger: Logger;

    public async injectAllDependencies() {
        this.logger.debug(`Starting injection of ${this.injects.length} elements...`);

        this.injects.forEach(({inject, originClass}) => {
            const classToInject = this.injectableMap.get(inject.target)

            if(classToInject !== undefined) {
                originClass[inject.varName] = classToInject;
            } else {
                this.logger.error(`Injectable component "${inject.target}" not found.`);
                throw new Error(`Injectable component "${inject.target}" not found.`);
            }
        })
    }

    public async loadInjectable(Class: SparkusClass, injectable: InjectableData): Promise<void> {
        this.injectableMap.set(injectable.name, Class.prototype);
        this.logger.info(`Injectable "${injectable.name}" successfully added.`);
    }

    public async loadInjects(Class: SparkusClass, injects: Array<InjectData>): Promise<void> {
        this.injects.push(...injects.map(value => {
            this.logger.warn(Class.name)
            return ({inject: value, originClass: Class})
        }));

        this.logger.debug(`Variable(s) "${injects.map(value => value.varName).join(",")}" added to be injected in "${Class.name}".`);
    }

    public async unload(url: URL): Promise<boolean> {
        return false;
    }
}