/// <reference types="node" resolution-mode="require"/>
import { IncomingMessage } from "node:http";
export type Method = 'GET' | 'POST';
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
export type SparkusRoute = {
    handler: Function;
    constructor: Function;
};
export declare class SparkusRouter {
    private logger;
    private routes;
    execute(req: IncomingMessage, secured?: boolean): SparkusRouterResponse;
    addRoute(path: string, handler: Function, constructor: Function, method: Method): void;
}
