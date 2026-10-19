import { join } from "node:path";
import type { AppOptions } from "sparkus";

/** The discovery fixture run from the sources: every *.controller.ts under src/discovered/. */
export function discoveryOptions(): AppOptions {
    return { controllers: join(import.meta.dirname, "discovered"), logger: false };
}
