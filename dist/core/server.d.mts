/// <reference types="node" resolution-mode="require"/>
import { Router } from "./router.mjs";
import * as http from "http";
export declare class Server {
    port: number;
    private router;
    private logger;
    constructor(port: number, router: Router);
    listen(): void;
    createSecuredServer(): http.Server;
    createBasicServer(): http.Server;
}
