// Entry point for running a fixture in a real process (Node or Bun).
// Prints one JSON line with the listening port, then serves until a signal.
// FIXTURE=production serves the production fixture; SHUTDOWN_DELAY sets listen()'s shutdownDelay.
import { createApp, type EngineChoice } from "sparkus";
import { fixtureOptions } from "./fixture.js";
import { productionOptions } from "./production.js";

const options = process.env.FIXTURE === "production" ? productionOptions() : fixtureOptions();
const app = createApp({ ...options, engine: (process.env.ENGINE as EngineChoice | undefined) ?? "auto" });
const info = await app.listen({
    port: Number(process.env.PORT ?? 0),
    hostname: "127.0.0.1",
    shutdownDelay: Number(process.env.SHUTDOWN_DELAY ?? 0),
});
process.stdout.write(JSON.stringify(info) + "\n");
