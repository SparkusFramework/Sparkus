function decode(value: string): string {
    if (value.indexOf("%") === -1 && value.indexOf("+") === -1) return value;
    try {
        return decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
        return value;
    }
}

/**
 * Parses a query string (without the leading "?"). The first occurrence of a
 * key wins. Null prototype, so keys like "__proto__" are harmless.
 */
export function parseQuery(qs: string): Record<string, string | undefined> {
    const out: Record<string, string> = Object.create(null);
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
