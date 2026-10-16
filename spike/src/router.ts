import { SparkusError } from "./errors.js";

export interface Match<H> {
    handler: H;
    params: Record<string, string>;
}

interface TrieNode<H> {
    children: Map<string, TrieNode<H>>;
    param: TrieNode<H> | null;
    paramName: string;
    handlers: Record<string, H>;
}

const NO_PARAMS: Record<string, string> = Object.freeze({}) as Record<string, string>;

function createNode<H>(): TrieNode<H> {
    return { children: new Map(), param: null, paramName: "", handlers: {} };
}

function decodeParam(value: string): string {
    if (value.indexOf("%") === -1) return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/**
 * Router used by engines that have no native one. Static paths are a single
 * Map lookup returning a preallocated match; dynamic paths walk a segment trie
 * where static segments win over parameters.
 */
export class Router<H> {
    private readonly statics = new Map<string, Record<string, Match<H>>>();
    private readonly root = createNode<H>();

    add(method: string, path: string, handler: H): void {
        if (!path.includes(":")) {
            let byMethod = this.statics.get(path);
            if (byMethod === undefined) this.statics.set(path, (byMethod = {}));
            byMethod[method] = { handler, params: NO_PARAMS };
            return;
        }

        let node = this.root;
        for (const segment of path.split("/").slice(1)) {
            if (segment.startsWith(":")) {
                const name = segment.slice(1);
                if (node.param === null) {
                    node.param = createNode();
                    node.paramName = name;
                } else if (node.paramName !== name) {
                    throw new SparkusError(
                        "SPK1006",
                        `Path "${path}" names a parameter ":${name}" where another route already uses ":${node.paramName}". ` +
                            "Use the same parameter name at the same position.",
                    );
                }
                node = node.param;
            } else {
                let child = node.children.get(segment);
                if (child === undefined) node.children.set(segment, (child = createNode()));
                node = child;
            }
        }
        node.handlers[method] = handler;
    }

    find(method: string, path: string): Match<H> | null {
        const byMethod = this.statics.get(path);
        if (byMethod !== undefined) {
            const match = byMethod[method];
            if (match !== undefined) return match;
        }

        const names: string[] = [];
        const values: string[] = [];
        const handler = this.walk(this.root, path.split("/"), 1, method, names, values);
        if (handler === undefined) return null;

        const params: Record<string, string> = {};
        for (let i = 0; i < names.length; i++) params[names[i]!] = decodeParam(values[i]!);
        return { handler, params };
    }

    private walk(
        node: TrieNode<H>,
        segments: string[],
        index: number,
        method: string,
        names: string[],
        values: string[],
    ): H | undefined {
        if (index === segments.length) return node.handlers[method];

        const segment = segments[index]!;
        const child = node.children.get(segment);
        if (child !== undefined) {
            const found = this.walk(child, segments, index + 1, method, names, values);
            if (found !== undefined) return found;
        }

        if (node.param !== null && segment.length > 0) {
            names.push(node.paramName);
            values.push(segment);
            const found = this.walk(node.param, segments, index + 1, method, names, values);
            if (found !== undefined) return found;
            names.pop();
            values.pop();
        }

        return undefined;
    }
}
