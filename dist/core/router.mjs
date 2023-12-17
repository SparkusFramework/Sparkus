var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { InjectLogger } from "../decorators/index.mjs";
let Router = class Router {
    logger;
    routes = new Map();
    execute(req, secured = false) {
        const url = new URL(req.url, `${secured ? "https" : "http"}://${req.headers.host}`);
        const request = {
            params: {},
            status: 200,
            path: url.pathname,
            method: req.method,
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
                }
                catch (error) {
                    // TODO: Make a better error handling system
                    this.logger.error(`Error executing route: ${req.url}.`, error);
                    return {
                        status: 500,
                        message: JSON.stringify({
                            code: 500,
                            message: "Internal Server Error",
                        }),
                        type: "application/json",
                    };
                }
            }
            else {
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
    addController(controller) {
        controller.endpoints.forEach((endpoint) => {
            this.addRoute(controller.path + "/" + endpoint.path, endpoint.handler, controller.constructor, endpoint.method);
        });
    }
    removeController(controller) {
        controller.endpoints.forEach((endpoint) => {
            this.removeRoute(controller.path + "/" + endpoint.path, endpoint.method);
        });
    }
    addRoute(path, handler, constructor, method) {
        if (!this.routes.has(method))
            this.routes.set(method, new Map());
        const methodMap = this.routes.get(method);
        console.log(methodMap);
        if (methodMap.has(path)) {
            this.logger.warn(`Route already exists: [${method}] ${path}.`);
            return;
        }
        methodMap.set(path, { handler, constructor });
        this.logger.debug(`Route [${method}] ${path} added.`);
    }
    removeRoute(path, method) {
        if (this.routes.has(method)) {
            const methodMap = this.routes.get(method);
            console.log(methodMap);
            methodMap.delete(path);
            this.logger.debug(`Route [${method}] ${path} removed.`);
            console.log(methodMap);
        }
    }
};
Router = __decorate([
    InjectLogger
], Router);
export { Router };
