// Public API: everything needed to write an application, nothing more.
// Engine authors import "@sparkus/core/engine".

export { createApp, SparkusApp, type AppOptions, type ListenOptions, type ListeningInfo, type RouteInfo } from "./app.js";
export { config, type ConfigOptions } from "./config.js";
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
export type { HealthCheck, HealthOptions } from "./health.js";
export { Logger, type LogFields, type LoggerOptions, type LogLevel, type LogThreshold } from "./log.js";
export {
    SECURITY_HEADERS,
    type Attributes,
    type AttributeValue,
    type CorsOptions,
    type Histogram,
    type Meter,
    type Span,
    type TelemetryOptions,
    type Tracer,
} from "./observe.js";
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
export type { ErrorMapper } from "./runtime.js";
export { t, type AnySchema, type Infer, type Issue, type Schema } from "./schema.js";
export type { StandardSchemaV1 } from "./standard.js";
