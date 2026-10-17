// Public API: everything needed to write an application, nothing more.
// Engine authors import "@sparkus/core/engine".

export { createApp, SparkusApp, type AppOptions, type ListenOptions, type ListeningInfo, type RouteInfo } from "./app.js";
export type { Ctx, HandlerResult, HttpMethod, RouteOptions } from "./context.js";
export {
    Controller,
    Delete,
    Get,
    Head,
    Options,
    Patch,
    Post,
    Put,
    UseGuards,
    UseInterceptors,
} from "./decorators.js";
export {
    inject,
    token,
    type Class,
    type InjectionToken,
    type OnInit,
    type OnShutdown,
    type Provider,
    type Token,
} from "./di.js";
export {
    ErrorCode,
    HttpError,
    SparkusError,
    type HttpErrorOptions,
    type ProblemDetails,
} from "./errors.js";
export type {
    Guard,
    GuardFn,
    GuardLike,
    Interceptor,
    InterceptorFn,
    InterceptorLike,
    Next,
} from "./pipeline.js";
export type { OpenApiOptions } from "./openapi.js";
export type { ErrorMapper, Logger } from "./runtime.js";
export { t, type Infer, type Issue, type Schema } from "./schema.js";
