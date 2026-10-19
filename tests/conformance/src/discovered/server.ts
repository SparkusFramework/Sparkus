// Entry point of the discovery fixture in a real process. Built unbundled into dist-discovered/
// (one file per controller, shared chunks), as an app deployed without a bundle: createApp()
// finds dist-discovered/**/*.controller.js, the top folder of this file in its package.
import { createApp, type EngineChoice } from "sparkus";

const app = createApp({ logger: false, engine: (process.env.ENGINE as EngineChoice | undefined) ?? "auto" });
const info = await app.listen({ port: Number(process.env.PORT ?? 0), hostname: "127.0.0.1" });
process.stdout.write(JSON.stringify(info) + "\n");
