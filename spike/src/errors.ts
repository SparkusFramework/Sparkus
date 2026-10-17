/**
 * Framework error with a stable code, so humans and agents can look it up.
 */
export class SparkusError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(`[${code}] ${message}`);
        this.name = "SparkusError";
    }
}

/**
 * Throw from a handler to answer with a given HTTP status.
 */
export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = "HttpError";
    }
}
