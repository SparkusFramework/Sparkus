import { SparkusDataType } from "../core/index.mjs";
export function Controller(path = '', options) {
    return (fn) => {
        fn.prototype._sparkus = {
            type: SparkusDataType.Controller,
            data: {
                path,
                name: fn.name
            }
        };
    };
}
export function GET(path = '') {
    return (target, propertyKey, descriptor) => {
        const fn = target[propertyKey];
        fn['_sparkus'] = {
            type: SparkusDataType.Endpoint,
            data: {
                path,
                method: 'GET',
                name: fn.name
            }
        };
    };
}
export function POST(path = '') {
    return (target, propertyKey, descriptor) => {
        const fn = target[propertyKey];
        fn['_sparkus'] = {
            type: SparkusDataType.Endpoint,
            data: {
                path,
                method: 'POST',
                name: fn.name
            }
        };
    };
}
