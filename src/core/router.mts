import { ControllerData, InjectLogger } from "../decorators/index.mjs";
import { Logger } from "../utils/index.mjs";
import { IncomingMessage } from "node:http";
import path from "node:path";

export type Method = "GET" | "POST";

export interface SparkusRouterResponse {
    status: number;
    message: string;
    type: string;
}

export interface SparkusRequest {
    path: string;
    params: { [key: string]: any };
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

@InjectLogger
export class Router {
    private logger: Logger;

    private routes = new Map<Method, Map<string, Route>>();

    public execute(
        req: IncomingMessage,
        secured: boolean = false,
    ): SparkusRouterResponse {
        const url = new URL(
            req.url,
            `${secured ? "https" : "http"}://${req.headers.host}`,
        );

        const request: SparkusRequest = {
            params: {},
            status: 200,
            path: url.pathname,
            method: req.method as Method,
            type: "application/json",
        };

        const method = this.routes.get(request.method);

        if (method) {
            const route = method.get(url.pathname);

            if (route) {
                const { handler, constructor } = route;

                try {
                    const output = handler.apply(constructor, request);

                    return {
                        status: request.status,
                        message: JSON.stringify(output),
                        type: request.type,
                    };
                } catch (error: any) {
                    // TODO: Make a better error handling system
                    this.logger.error(
                        `Error executing route: ${req.url}.`,
                        error,
                    );

                    return {
                        status: 500,
                        message: JSON.stringify({
                            code: 500,
                            message: "Internal Server Error",
                        }),
                        type: "application/json",
                    };
                }
            } else {
                this.logger.warn(`Route not found: ${req.url}`);
                return {
                    status: 404,
                    message: JSON.stringify({
                        code: 404,
                        message: "Not Found",
                    }),
                    type: "application/json",
                };
            }
        }

        this.logger.warn(`Method not implemented: ${request.method}`);

        return {
            status: 501,
            message: JSON.stringify({ code: 501, message: "Not Implemented" }),
            type: "application/json",
        };
    }

    public addController(controller: ControllerData) {
        controller.endpoints.forEach((endpoint) => {
            this.addRoute(
                controller.path + "/" + endpoint.path,
                endpoint.handler,
                controller.constructor,
                endpoint.method,
            );
        });
    }

    public removeController(controller: ControllerData) {
        controller.endpoints.forEach((endpoint) => {
            this.removeRoute(
                controller.path + "/" + endpoint.path,
                endpoint.method,
            );
        });
    }

    private addRoute(
        path: string,
        handler: Function,
        constructor: Function,
        method: Method,
    ): void {
        if (!this.routes.has(method))
            this.routes.set(method, new Map<string, Route>());

        const methodMap = this.routes.get(method);
        console.log(methodMap);

        if (methodMap.has(path)) {
            this.logger.warn(`Route already exists: [${method}] ${path}.`);
            return;
        }

        methodMap.set(path, { handler, constructor });

        this.logger.debug(`Route [${method}] ${path} added.`);
    }

    private removeRoute(path: string, method: Method) {
        if (this.routes.has(method)) {
            const methodMap = this.routes.get(method);
            console.log(methodMap);
            methodMap.delete(path);
            this.logger.debug(`Route [${method}] ${path} removed.`);
            console.log(methodMap);
        }
    }
}
