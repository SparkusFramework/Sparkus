// Engine SPI: what an HTTP engine (or another Sparkus package) needs to serve a
// Sparkus app. Applications never import this module; they use "@sparkus/core" (or "sparkus").

export type { Engine, EngineListenOptions, EngineServer } from "./app.js";
export type { CompiledRoute } from "./compile.js";
export { NO_PARAMS, RequestExtras, type RequestContext } from "./context.js";
export { Container } from "./di.js";
export { callerFile } from "./discover.js";
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
export { compileParser, compileProjector, compileValidator, type Parser, type Projector, type Validator } from "./schema.js";
export type { BareResponse, Observer } from "./observe.js";
export {
    WebContext,
    createFetchHandler,
    createWebHandler,
    errorResponse,
    toResponse,
    unroutedResponse,
    type WebHandler,
} from "./web.js";
