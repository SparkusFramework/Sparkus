function decode(value: string): string {
    if (value.indexOf("%") === -1 && value.indexOf("+") === -1) return value;
    try {
        return decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
        return value;
    }
}

/**
 * Query objects inherit from an empty null-prototype object, so keys like
 * "__proto__" or "toString" are plain own properties. Not `Object.create(null)`:
 * V8 creates those in dictionary mode: ~4x slower to fill under Node 24.
 */
const Query = function () {} as unknown as new () => Record<string, string>;
Query.prototype = Object.create(null);

/** Parses a query string (without the leading "?"). The first occurrence of a key wins. */
export function parseQuery(qs: string): Record<string, string | undefined> {
    const out = new Query();
    let start = 0;

    while (start < qs.length) {
        let end = qs.indexOf("&", start);
        if (end === -1) end = qs.length;

        if (end > start) {
            const eq = qs.indexOf("=", start);
            const hasValue = eq !== -1 && eq < end;
            const key = decode(qs.slice(start, hasValue ? eq : end));
            if (!(key in out)) out[key] = hasValue ? decode(qs.slice(eq + 1, end)) : "";
        }

        start = end + 1;
    }

    return out;
}
