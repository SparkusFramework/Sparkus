import { serve } from "@hono/node-server";
import { HOST, PORT } from "../shared.js";
import { app } from "./app.js";

serve({ fetch: app.fetch, port: PORT, hostname: HOST });
