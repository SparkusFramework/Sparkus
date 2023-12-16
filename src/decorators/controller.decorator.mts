import {Method, SparkusData, SparkusDataType} from "../core/index.mjs";

export function Controller(path: string = '', options?: {}): ClassDecorator {
    return (fn: Function) => {
        fn.prototype._sparkus = {
            type: SparkusDataType.Controller,
            data: {
                path,
                name: fn.name
            }
        } as SparkusData
    }
}

export function GET(path: string = ''): MethodDecorator {
    return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) => {
        const fn: Function = target[propertyKey];

        fn['_sparkus'] = {
            type: SparkusDataType.Endpoint,
            data: {
                path,
                method: 'GET' as Method,
                name: fn.name
            }
        }
    };
}

export function POST(path: string = ''): MethodDecorator {
    return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) => {
        const fn: Function = target[propertyKey];

        fn['_sparkus'] = {
            type: SparkusDataType.Endpoint,
            data: {
                path,
                method: 'POST' as Method,
                name: fn.name
            }
        }
    };
}