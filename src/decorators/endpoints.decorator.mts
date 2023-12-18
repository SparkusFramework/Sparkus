import { EndpointData, Method, SparkusDataType, SparkusObject } from "../types/index.mjs";
import { simpleDecoratorFactory } from "../utils/index.mjs";

function endpointDecoratorFactory(path: string, method: Method) {
    return (target: any, key: string) => {
        const fn = target[key];
        const sparkusMethod: SparkusObject<EndpointData> = simpleDecoratorFactory<EndpointData>(fn, SparkusDataType.Endpoint);

        sparkusMethod.data.endpoint = {
            path,
            method: method,
            name: fn.name,
            handler: fn
        };
    }
}
export function GET(path: string = ""): MethodDecorator {
    return endpointDecoratorFactory(path, "GET");
}

export function POST(path: string = ""): MethodDecorator {
    return endpointDecoratorFactory(path, "POST");
}

export function PUT(path: string = ""): MethodDecorator {
    return endpointDecoratorFactory(path, "PUT");
}

export function DELETE(path: string = ""): MethodDecorator {
    return endpointDecoratorFactory(path, "DELETE");
}

