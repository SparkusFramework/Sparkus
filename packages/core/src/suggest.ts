import type { CompiledRoute } from "./compile.js";

/** Edit distance where swapping two adjacent characters counts as one edit. */
function distance(a: string, b: string): number {
    const d = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
            d[i]![j] = best;
        }
    }
    return d[a.length]![b.length]!;
}

function segments(path: string): string[] {
    return path === "/" ? [] : path.split("/").slice(1);
}

/**
 * The route a 404 most likely meant: a typo, wrong case, a missing or extra
 * segment, a trailing slash. Parameters match any segment. Only used when
 * errors are exposed (development, test): production 404s cost nothing more.
 */
export function suggestRoute(routes: readonly CompiledRoute[], method: string, path: string): string | undefined {
    const wanted = segments(path);
    let best: CompiledRoute | undefined;
    let bestScore = Infinity;

    for (const route of routes) {
        const pattern = segments(route.path);
        let score = Math.abs(pattern.length - wanted.length) * 2;
        for (let i = 0; i < Math.min(pattern.length, wanted.length); i++) {
            const expected = pattern[i]!;
            const actual = wanted[i]!;
            if (expected.startsWith(":") ? actual.length > 0 : expected === actual) continue;
            const folded = distance(expected.toLowerCase(), actual.toLowerCase());
            score += folded === 0 ? 0.5 : folded;
        }
        if (route.method !== method && !(method === "HEAD" && route.method === "GET")) score += 1;
        if (score < bestScore) [best, bestScore] = [route, score];
    }

    return best !== undefined && bestScore <= Math.max(2, path.length / 5) ? `${best.method} ${best.path}` : undefined;
}
