import { ControllerData } from "../../types/index.mjs";
import { Router } from "../router.mjs";
export declare class ControllerManager {
    private readonly router;
    private readonly pathControllerMap;
    private logger;
    constructor(router: Router);
    load(url: URL, controller: ControllerData): Promise<void>;
    unload(url: URL): Promise<boolean>;
}
