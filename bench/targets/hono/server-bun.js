import { HOST, PORT } from "../shared.js";
import { app } from "./app.js";

Bun.serve({ port: PORT, hostname: HOST, fetch: app.fetch });
