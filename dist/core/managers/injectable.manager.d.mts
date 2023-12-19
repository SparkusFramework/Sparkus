import { InjectableData, InjectData, SparkusClass } from "../../types/index.mjs";
export declare class InjectableManager {
    private readonly injectableMap;
    private readonly injects;
    private logger;
    injectAllDependencies(): Promise<void>;
    loadInjectable(Class: SparkusClass, injectable: InjectableData): Promise<void>;
    loadInjects(Class: SparkusClass, injects: Array<InjectData>): Promise<void>;
    unload(url: URL): Promise<boolean>;
}
