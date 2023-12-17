import { Method, SparkusData, SparkusDataType } from "../core/index.mjs";

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

export function Controller(path: string = "", options?: {}): ClassDecorator {
    return (fn: Function) => {
        fn.prototype._sparkus = {
            type: SparkusDataType.Controller,
            data: {
                path,
                name: fn.name,
                endpoints: [],
                constructor: fn,
            } as ControllerData,
        } as SparkusData;
    };
}

export function GET(path: string = ""): MethodDecorator {
    return (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>,
    ) => {
        const fn: Function = target[propertyKey];

        fn["_sparkus"] = {
            type: SparkusDataType.Endpoint,
            data: {
                path,
                method: "GET" as Method,
                name: fn.name,
                handler: fn,
            } as EndpointData,
        } as SparkusData;
    };
}

export function POST(path: string = ""): MethodDecorator {
    return (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>,
    ) => {
        const fn: Function = target[propertyKey];

        fn["_sparkus"] = {
            type: SparkusDataType.Endpoint,
            data: {
                path,
                method: "POST" as Method,
                name: fn.name,
                handler: fn,
            } as EndpointData,
        };
    };
}
