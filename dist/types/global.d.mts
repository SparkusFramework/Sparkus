export type Method = "GET" | "POST" | "DELETE" | "PUT";
export interface SparkusObject<T = any> {
    type: SparkusDataType;
    data: {
        [key: string]: T;
    };
}
export declare enum SparkusDataType {
    Controller = 0,
    Service = 1,
    Endpoint = 2,
    Other = 3
}
export type DefaultClass<T = unknown> = new (...args: any) => T;
export type DefaultFunction<T = unknown> = () => T;
export interface SparkusClass<T = unknown> extends DefaultClass<T> {
    _sparkus: SparkusObject;
}
export interface SparkusFunction<T = unknown> extends DefaultFunction<T> {
    _sparkus: SparkusObject;
}
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
export interface LoggerData {
    name: string;
}
