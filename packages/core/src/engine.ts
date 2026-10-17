// Engine SPI: what an HTTP engine needs to serve a Sparkus app. Applications
// never import this module; they use "@sparkus/core" (or "sparkus").

export type { Engine, EngineServer } from "./app.js";
export type { CompiledRoute } from "./compile.js";
export { NO_PARAMS, type RequestContext } from "./context.js";
export { Container } from "./di.js";
export {
    PROBLEM_TYPE,
    isJsonContentType,
    malformedJson,
    payloadTooLarge,
    statusTitle,
    unsupportedMediaType,
    type RenderedError,
} from "./errors.js";
export { generateOpenApi, toJsonSchema } from "./openapi.js";
export { parseQuery } from "./query.js";
export { Router, decodeParam, type Match } from "./router.js";
export { AppRuntime } from "./runtime.js";
export { compileValidator, type Validator } from "./schema.js";
export { WebContext, createFetchHandler, createWebHandler, errorResponse, toResponse, type WebHandler } from "./web.js";
