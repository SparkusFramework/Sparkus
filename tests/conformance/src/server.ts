// Entry point for running the fixture in a real process (Node or Bun).
// Prints one JSON line with the listening port, then serves until a signal.
import { createApp, type EngineChoice } from "sparkus";
import { fixtureOptions } from "./fixture.js";

const app = createApp({ ...fixtureOptions(), engine: (process.env.ENGINE as EngineChoice | undefined) ?? "auto" });
const info = await app.listen({ port: Number(process.env.PORT ?? 0), hostname: "127.0.0.1" });
process.stdout.write(JSON.stringify(info) + "\n");
