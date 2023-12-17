import { Method } from "../core/index.mjs";
export interface EndpointData {
    path: string;
    name: string;
    method: Method;
    handler: Function;
}
export interface ControllerData {
    path: string;
    name: string;
    endpoints: EndpointData[];
    constructor: Function;
}
export declare function Controller(path?: string, options?: {}): ClassDecorator;
export declare function GET(path?: string): MethodDecorator;
export declare function POST(path?: string): MethodDecorator;
