/// <reference types="node" resolution-mode="require"/>
import { SparkusRouter } from "./router.mjs";
import * as http from "http";
export declare class SparkusServer {
    port: number;
    private router;
    private logger;
    constructor(port: number, router: SparkusRouter);
    listen(): void;
    createSecuredServer(): http.Server;
    createBasicServer(): http.Server;
}
