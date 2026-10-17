import { NO_PARAMS } from "./context.js";
import { ErrorCode, SparkusError } from "./errors.js";

export interface Match<H> {
    readonly handler: H;
    readonly params: Readonly<Record<string, string>>;
}

type Params = Record<string, string>;

interface Endpoint<H> {
    /** Handlers by method. Null prototype: safe to index with any method string. */
    readonly handlers: Record<string, H>;
    /** Preallocated matches by method, for static paths. */
    readonly matches: Record<string, Match<H>>;
    /** Builds the params object from the captured values; one generated function per route shape. */
    makeParams: (values: readonly string[]) => Params;
}

interface Node<H> {
    readonly keys: string[];
    readonly children: Node<H>[];
    /** Built when a node has many static children; below that, a linear scan without allocation wins. */
    map: Map<string, Node<H>> | null;
    param: Node<H> | null;
    paramName: string;
    endpoint: Endpoint<H> | null;
}

const MAP_THRESHOLD = 8;
const METHOD_ORDER = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function createNode<H>(): Node<H> {
    return { keys: [], children: [], map: null, param: null, paramName: "", endpoint: null };
}

function createEndpoint<H>(names: readonly string[]): Endpoint<H> {
    return {
        handlers: Object.create(null),
        matches: Object.create(null),
        makeParams: names.length === 0 ? () => NO_PARAMS : paramFactory(names),
    };
}

export function decodeParam(value: string): string {
    if (value.indexOf("%") === -1) return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/**
 * Generates `(v) => ({ id: d(v[0]), postId: d(v[1]) })`: every params object
 * of a route has the same shape, created in one step, so property access in
 * handlers stays monomorphic.
 */
function paramFactory(names: readonly string[]): (values: readonly string[]) => Params {
    const fields = names.map((name, i) => `${JSON.stringify(name)}: d(v[${i}])`).join(", ");
    return new Function("d", `return function makeParams(v) { return { ${fields} }; };`)(decodeParam);
}

function accepts(endpoint: Endpoint<unknown>, method: string): boolean {
    return endpoint.handlers[method] !== undefined || (method === "HEAD" && endpoint.handlers.GET !== undefined);
}

/**
 * Router for engines without a native one, and the fallback of those that
 * have one. Same rules as Bun's router: case-sensitive, a trailing slash is a
 * different path, parameters are decoded, static segments win over parameters
 * (with backtracking), HEAD falls back to GET.
 *
 * Static paths cost one Map lookup and return a preallocated match. Dynamic
 * paths walk a segment trie by index: no split, no allocation on failed
 * branches, one slice per captured parameter.
 */
export class Router<H> {
    private readonly statics = new Map<string, Endpoint<H>>();
    private readonly root = createNode<H>();
    private hasDynamic = false;
    /** Scratch buffer for captured values; safe because find() is synchronous. */
    private readonly values: string[] = [];

    add(method: string, path: string, handler: H): void {
        let endpoint: Endpoint<H>;
        if (!path.includes(":")) {
            endpoint = this.statics.get(path) ?? createEndpoint<H>([]);
            this.statics.set(path, endpoint);
        } else {
            this.hasDynamic = true;
            const names: string[] = [];
            let node = this.root;
            for (const segment of path.split("/").slice(1)) {
                if (segment.startsWith(":")) {
                    const name = segment.slice(1);
                    if (node.param === null) {
                        node.param = createNode();
                        node.paramName = name;
                    } else if (node.paramName !== name) {
                        throw new SparkusError(
                            ErrorCode.ParamConflict,
                            `Path "${path}" names a parameter ":${name}" where another route already uses ":${node.paramName}". ` +
                                "Use the same parameter name at the same position.",
                        );
                    }
                    names.push(name);
                    node = node.param;
                } else {
                    node = this.staticChildForInsert(node, segment);
                }
            }
            endpoint = node.endpoint ??= createEndpoint<H>(names);
        }

        if (endpoint.handlers[method] !== undefined) {
            throw new SparkusError(ErrorCode.DuplicateRoute, `Route ${method} ${path} is registered twice.`);
        }
        endpoint.handlers[method] = handler;
        endpoint.matches[method] = { handler, params: NO_PARAMS };
    }

    /** Finds the handler for a request. Returns null when nothing matches the method and path. */
    find(method: string, path: string): Match<H> | null {
        const endpoint = this.statics.get(path);
        if (endpoint !== undefined) {
            const match = endpoint.matches[method] ?? (method === "HEAD" ? endpoint.matches.GET : undefined);
            if (match !== undefined) return match;
        }
        if (!this.hasDynamic) return null;

        const found = this.walk(this.root, path, 1, 0, method);
        if (found === null) return null;
        return {
            handler: (found.handlers[method] ?? found.handlers.GET)!,
            params: found.makeParams(this.values),
        };
    }

    /**
     * The `Allow` header value when the path exists with other methods, or
     * null when the path does not exist at all (404). Slow path, for misses.
     */
    allowed(path: string): string | null {
        const methods = new Set<string>();
        const endpoint = this.statics.get(path);
        if (endpoint !== undefined) for (const method in endpoint.handlers) methods.add(method);
        if (this.hasDynamic) this.collect(this.root, path, 1, methods);
        if (methods.size === 0) return null;
        if (methods.has("GET")) methods.add("HEAD");
        const ordered = METHOD_ORDER.filter((m) => methods.has(m));
        for (const m of methods) if (!ordered.includes(m)) ordered.push(m);
        return ordered.join(", ");
    }

    private staticChildForInsert(node: Node<H>, segment: string): Node<H> {
        const index = node.keys.indexOf(segment);
        if (index !== -1) return node.children[index]!;
        const child = createNode<H>();
        node.keys.push(segment);
        node.children.push(child);
        if (node.keys.length > MAP_THRESHOLD) node.map = new Map(node.keys.map((k, i) => [k, node.children[i]!]));
        return child;
    }

    private staticChild(node: Node<H>, path: string, start: number, end: number): Node<H> | null {
        if (node.map !== null) return node.map.get(path.slice(start, end)) ?? null;
        const keys = node.keys;
        const length = end - start;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]!;
            if (key.length === length && path.startsWith(key, start)) return node.children[i]!;
        }
        return null;
    }

    private walk(node: Node<H>, path: string, start: number, depth: number, method: string): Endpoint<H> | null {
        let end = path.indexOf("/", start);
        const last = end === -1;
        if (last) end = path.length;

        if (node.keys.length > 0) {
            const child = this.staticChild(node, path, start, end);
            if (child !== null) {
                if (last) {
                    const endpoint = child.endpoint;
                    if (endpoint !== null && accepts(endpoint, method)) return endpoint;
                } else {
                    const found = this.walk(child, path, end + 1, depth, method);
                    if (found !== null) return found;
                }
            }
        }

        const param = node.param;
        if (param !== null && end > start) {
            if (last) {
                const endpoint = param.endpoint;
                if (endpoint !== null && accepts(endpoint, method)) {
                    this.values[depth] = path.slice(start, end);
                    return endpoint;
                }
            } else {
                const found = this.walk(param, path, end + 1, depth + 1, method);
                if (found !== null) {
                    this.values[depth] = path.slice(start, end);
                    return found;
                }
            }
        }

        return null;
    }

    private collect(node: Node<H>, path: string, start: number, methods: Set<string>): void {
        let end = path.indexOf("/", start);
        const last = end === -1;
        if (last) end = path.length;

        const visit = (next: Node<H>) => {
            if (!last) return this.collect(next, path, end + 1, methods);
            if (next.endpoint !== null) for (const method in next.endpoint.handlers) methods.add(method);
        };

        const child = this.staticChild(node, path, start, end);
        if (child !== null) visit(child);
        if (node.param !== null && end > start) visit(node.param);
    }
}
