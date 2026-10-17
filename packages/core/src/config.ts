import { token, type InjectionToken, type Provider } from "./di.js";
import { ErrorCode, SparkusError } from "./errors.js";
import { compileValidator, oneOf, type ObjectType, type Schema } from "./schema.js";

type ConfigShape = Record<string, Schema<unknown, boolean>>;

/** A `config()` token: inject it, or replace it in tests with `override()`. */
export interface ConfigToken<T> extends InjectionToken<T> {
    /**
     * A provider for tests: the given values, typed, over what the environment gives (defaults
     * included). Values still pass the schema, and a required variable missing from both is SPK1018.
     *
     *     createTestApp({ controllers, providers, overrides: [AppConfig.override({ PAGE_SIZE: 5 })] })
     */
    override(values: Partial<T>): Provider<T>;
}

export interface ConfigOptions {
    /** Name of the token, shown in errors. Default: "Config". */
    name?: string;
    /** Where the values come from. Default: `process.env`, read when the token is first resolved (at startup). */
    env?: Readonly<Record<string, string | undefined>>;
}

const INTEGER = /^-?\d+$/;
const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const SCALARS = new Set(["string", "integer", "number", "boolean", "enum"]);

/**
 * Typed configuration read from environment variables and checked at startup. Each key is a
 * variable name; the token's value is a frozen object of converted values:
 *
 *     export const AppConfig = config({
 *         DATABASE_URL: t.string({ min: 1 }),
 *         PORT: t.integer({ min: 1, default: 3000 }),
 *         MODE: t.enum(["live", "sandbox"], { default: "sandbox" }),
 *         ALLOWED_ORIGINS: t.optional(t.array(t.string())),   // comma-separated
 *     });
 *
 *     private readonly config = inject(AppConfig);   // this.config.PORT is a number
 *
 * Fields are `t.string()`, `t.integer()`, `t.number()`, `t.boolean()` ("true", "false", "1", "0"),
 * `t.enum()`, or `t.array()` of those (comma-separated). An empty variable counts as unset. Any
 * missing or invalid variable stops the app with SPK1018, which lists them all. Values are never
 * printed: they may be secrets. In tests, provide the token: `{ provide: AppConfig, useValue: {...} }`.
 */
export function config<S extends ConfigShape>(shape: S, options: ConfigOptions = {}): ConfigToken<Readonly<ObjectType<S>>> {
    const name = options.name ?? "Config";
    for (const [key, field] of Object.entries(shape)) checkField(name, key, field);
    const env = () => options.env ?? globalThis.process?.env ?? {};
    const configToken: ConfigToken<Readonly<ObjectType<S>>> = Object.freeze({
        ...token(name, () => loadConfig(shape, env(), name) as ObjectType<S>),
        override: (values: Partial<ObjectType<S>>) => ({
            provide: configToken,
            useFactory: () => loadConfig(shape, env(), name, values) as ObjectType<S>,
        }),
    });
    return configToken;
}

function invalidShape(name: string, key: string, reason: string): SparkusError {
    return new SparkusError(ErrorCode.InvalidConfig, `config() ${name}: ${key} ${reason}.`);
}

function checkField(name: string, key: string, field: Schema): void {
    const scalar = field.kind === "array" ? field.item! : field;
    if (!SCALARS.has(scalar.kind) || (field.kind === "array" && scalar.optional)) {
        const what = field.kind === "array" ? `is an array of t.${scalar.kind}()` : `is t.${field.kind}()`;
        throw invalidShape(name, key, `${what}, but environment variables are flat strings. Use t.string(), t.integer(), t.number(), t.boolean(), t.enum(), or t.array() of those`);
    }
    if (field.nullable === true || scalar.nullable === true) {
        throw invalidShape(name, key, "is nullable, but an environment variable is a string or unset. Remove t.nullable(); use t.optional() for an unset variable");
    }
    if (scalar.kind === "enum" && (scalar.values === undefined || scalar.values.length === 0)) {
        throw invalidShape(name, key, "is t.enum([]) without values. List at least one");
    }
    if (field.default !== undefined && field.optional) {
        throw invalidShape(name, key, "has both t.optional() and a default. A default fills an unset variable: remove t.optional()");
    }
    if (field.default !== undefined) {
        const issue = compileValidator(field)(field.default);
        if (issue !== null) throw invalidShape(name, key, `has default ${JSON.stringify(field.default)}, which ${issue.message}. Change the default or the schema`);
    }
}

/** Converts one variable. Returns the value, or the issue as a string. */
function convert(field: Schema, raw: string): { value: unknown } | string {
    const { min, max } = field.bounds;
    switch (field.kind) {
        case "string":
            if (min !== undefined && raw.length < min) return `must have at least ${min} characters`;
            if (max !== undefined && raw.length > max) return `must have at most ${max} characters`;
            return { value: raw };
        case "integer":
        case "number": {
            const text = raw.trim();
            if (field.kind === "integer" ? !INTEGER.test(text) : !NUMBER.test(text)) return `must be ${field.kind === "integer" ? "an integer" : "a number"}`;
            const value = Number(text);
            if (field.kind === "integer" && !Number.isSafeInteger(value)) return "must be a safe integer";
            if (!Number.isFinite(value)) return "must be a finite number";
            if (min !== undefined && value < min) return `must be >= ${min}`;
            if (max !== undefined && value > max) return `must be <= ${max}`;
            return { value };
        }
        case "boolean": {
            const text = raw.trim().toLowerCase();
            if (text === "true" || text === "1") return { value: true };
            if (text === "false" || text === "0") return { value: false };
            return 'must be "true", "false", "1" or "0"';
        }
        case "enum": {
            const text = raw.trim();
            return field.values!.includes(text) ? { value: text } : `must be ${oneOf(field.values!)}`;
        }
        case "array": {
            const items: unknown[] = [];
            for (const part of raw.split(",")) {
                const text = part.trim();
                if (text.length === 0) continue;
                const item = convert(field.item!, text);
                if (typeof item === "string") return `has an invalid item ${items.length + 1}: it ${item}`;
                items.push(item.value);
            }
            if (min !== undefined && items.length < min) return `must have at least ${min} comma-separated items`;
            if (max !== undefined && items.length > max) return `must have at most ${max} comma-separated items`;
            return { value: items };
        }
        default:
            return "has an unsupported type";
    }
}

/** Reads the variables of `shape`; `given` (tests) replaces some of them with typed values. */
export function loadConfig(
    shape: ConfigShape,
    env: Readonly<Record<string, string | undefined>>,
    name: string,
    given: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    const issues: string[] = [];
    for (const [key, field] of Object.entries(shape)) {
        if (given[key] !== undefined) {
            const issue = compileValidator(field)(given[key]);
            if (issue !== null) issues.push(`${key} (override) ${issue.message}`);
            else out[key] = given[key];
            continue;
        }
        const raw = env[key];
        if (raw === undefined || raw === "") {
            if (field.default !== undefined) out[key] = field.default;
            else if (!field.optional) issues.push(`${key} is required`);
            continue;
        }
        const result = convert(field, raw);
        if (typeof result === "string") issues.push(`${key} ${result}`);
        else out[key] = result.value;
    }
    if (issues.length > 0) {
        throw new SparkusError(
            ErrorCode.InvalidConfig,
            `Invalid configuration (${name}): ${issues.join("; ")}. ` +
                "Set these environment variables (shell, .env file, deployment settings), or change the config() schema.",
        );
    }
    return Object.freeze(out);
}
