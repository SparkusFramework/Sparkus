import { SparkusDataType } from "../types/index.mjs";
import { simpleDecoratorFactory } from "../utils/index.mjs";
function endpointDecoratorFactory(path, method) {
    return (target, key) => {
        const fn = target[key];
        const sparkusMethod = simpleDecoratorFactory(fn, SparkusDataType.Endpoint);
        sparkusMethod.data.endpoint = {
            path,
            method: method,
            name: fn.name,
            handler: fn
        };
    };
}
export function GET(path = "") {
    return endpointDecoratorFactory(path, "GET");
}
export function POST(path = "") {
    return endpointDecoratorFactory(path, "POST");
}
export function PUT(path = "") {
    return endpointDecoratorFactory(path, "PUT");
}
export function DELETE(path = "") {
    return endpointDecoratorFactory(path, "DELETE");
}
