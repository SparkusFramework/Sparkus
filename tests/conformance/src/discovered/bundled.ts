// Entry point of the bundled discovery fixture (dist-bundled/, built with sparkusPlugin()): the
// bundle holds no controller file, its controllers come from the manifest written at build time.
import { createApp, type EngineChoice } from "sparkus";

export function build(engine: EngineChoice = "auto") {
    return createApp({ logger: false, engine });
}
