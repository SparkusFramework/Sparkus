/// <reference types="node" resolution-mode="require"/>
import { IncomingMessage } from "node:http";
import { ControllerData, Method } from "../types/index.mjs";
export interface SparkusRouterResponse {
    status: number;
    message: string;
    type: string;
}
export interface SparkusRequest {
    path: string;
    params: {
        [key: string]: any;
    };
    method: Method;
    status: number;
    type: string;
}
export interface SparkusDataEndpoint {
    path: string;
    method: Method;
    name: string;
}
export type Route = {
    handler: Function;
    constructor: Function;
};
export declare class Router {
    private logger;
    private routes;
    execute(req: IncomingMessage, secured?: boolean): SparkusRouterResponse;
    addController(controller: ControllerData): void;
    removeController(controller: ControllerData): void;
    private addRoute;
    private removeRoute;
}
