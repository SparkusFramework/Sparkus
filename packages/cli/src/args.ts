/**
 * Command line parser, homemade (no dependency). Supports `--flag`,
 * `--flag=value`, `--flag value`, `-f`, `--no-flag` and `--`. Unknown flags
 * are errors with a suggestion, so a typo never goes unnoticed.
 */
export interface FlagSpec {
    type: "boolean" | "string";
    short?: string;
    description: string;
}

export type FlagSpecs = Record<string, FlagSpec>;

export interface ParsedArgs {
    positionals: string[];
    flags: Record<string, string | boolean>;
}

export class ArgsError extends Error {
    override readonly name = "ArgsError";
}

/** Edit distance where swapping two adjacent letters counts as one edit (typos like "jsno"). */
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

/** The closest known name, if it is close enough to be a typo. */
export function suggest(input: string, known: readonly string[]): string | undefined {
    let best: string | undefined;
    let bestDistance = Infinity;
    for (const name of known) {
        const d = distance(input, name);
        if (d < bestDistance) [best, bestDistance] = [name, d];
    }
    return bestDistance <= Math.max(1, Math.floor(input.length / 3)) ? best : undefined;
}

export function parseArgs(argv: readonly string[], specs: FlagSpecs): ParsedArgs {
    const positionals: string[] = [];
    const flags: Record<string, string | boolean> = {};
    const byShort = new Map(Object.entries(specs).flatMap(([name, spec]) => (spec.short ? [[spec.short, name]] : [])));

    const unknown = (flag: string) => {
        const hint = suggest(flag, Object.keys(specs));
        return new ArgsError(`Unknown flag --${flag}.${hint ? ` Did you mean --${hint}?` : ""}`);
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!;
        if (arg === "--") {
            positionals.push(...argv.slice(i + 1));
            break;
        }
        if (arg.startsWith("--")) {
            const eq = arg.indexOf("=");
            let name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
            let negated = false;
            if (!(name in specs) && name.startsWith("no-") && specs[name.slice(3)]?.type === "boolean") {
                name = name.slice(3);
                negated = true;
            }
            const spec = specs[name];
            if (spec === undefined) throw unknown(name);
            if (spec.type === "boolean") {
                if (eq !== -1) throw new ArgsError(`--${name} is a boolean flag and takes no value.`);
                flags[name] = !negated;
            } else if (eq !== -1) {
                flags[name] = arg.slice(eq + 1);
            } else {
                const value = argv[i + 1];
                if (value === undefined || value.startsWith("-")) throw new ArgsError(`--${name} needs a value.`);
                flags[name] = value;
                i++;
            }
        } else if (arg.startsWith("-") && arg.length > 1) {
            for (let j = 1; j < arg.length; j++) {
                const name = byShort.get(arg[j]!);
                if (name === undefined) throw new ArgsError(`Unknown flag -${arg[j]}.`);
                const spec = specs[name]!;
                if (spec.type === "boolean") {
                    flags[name] = true;
                } else {
                    const value = j < arg.length - 1 ? arg.slice(j + 1) : argv[++i];
                    if (value === undefined) throw new ArgsError(`-${arg[j]} needs a value.`);
                    flags[name] = value;
                    break;
                }
            }
        } else {
            positionals.push(arg);
        }
    }

    return { positionals, flags };
}
