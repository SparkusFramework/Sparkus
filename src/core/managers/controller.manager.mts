import { ControllerData, EndpointData, LoadStatus, SparkusDataType, SparkusObject } from "../../types/index.mjs";
import { Router } from "../router.mjs";
import { InitLoggerClass } from "../../decorators/index.mjs";
import { Logger } from "../../utils/index.mjs";

@InitLoggerClass()
export class ControllerManager {

    private readonly pathControllerMap: Map<string, ControllerData> = new Map();

    private logger: Logger;

    constructor(private readonly router: Router) {}

    public async load(url: URL, controller: ControllerData): Promise<void> {
        this.logger.debug(`Loading controller "${controller.name}"...`);

        const methods = Object.getOwnPropertyDescriptors(
            controller.constructor.prototype,
        );

        Object.keys(methods).forEach((methodName: string) => {
            if (methods[methodName].value._sparkus) {
                let methodData: SparkusObject =
                    methods[methodName].value._sparkus[0]; // TODO: for each

                const isEndpoint =
                    methodData.type === SparkusDataType.Endpoint;

                if (isEndpoint) {
                    const endpoint = methodData.data.endpoint as EndpointData;
                    controller.endpoints.push(endpoint);
                }
            }
        });

        this.router.addController(controller);
        this.pathControllerMap.set(url.pathname, controller);

        this.logger.info(`Controller "${controller.name}" successfully added.`);
    }

    public async unload(url: URL): Promise<boolean> {
        const controller = this.pathControllerMap.get(url.pathname);

        if (controller) {
            this.logger.debug(`Unloading controller "${controller.name}"...`);
            this.router.removeController(controller);
            return true;
        }

        return false;
    }
}