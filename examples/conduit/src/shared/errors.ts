import { HttpError } from "sparkus";

// RealWorld clients read `errors: { field: [messages] }`. Field errors carry it themselves; every other error gets
// `errors.body` added by `realWorldErrors` below.
export function invalidField(field: string, message: string, code: string): HttpError {
    return HttpError.unprocessable(`${field} ${message}.`, { code, extensions: { errors: { [field]: [message] } } });
}

// App `onError`: Sparkus' validation errors (400 SPK2004) become the 422 RealWorld expects, and every HttpError gets
// an `errors` field. Bodies stay problem+json (status, code, detail), plus `errors`.
export function realWorldErrors(error: unknown): HttpError | undefined {
    if (!(error instanceof HttpError)) return undefined;
    if (error.extensions?.errors !== undefined) return undefined;
    const detail = error.detail ?? error.title;
    const status = error.code === "SPK2004" ? 422 : error.status;
    return new HttpError(status, detail, {
        code: error.code,
        headers: error.headers,
        extensions: { ...error.extensions, errors: { body: [detail] } },
    });
}
