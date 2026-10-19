import app from "./app.ts";
import { AppConfig } from "./config.ts";

const { PORT, SHUTDOWN_DELAY } = app.get(AppConfig);
// Logs "Listening on ...". On SIGTERM: /ready fails for SHUTDOWN_DELAY ms, then in-flight requests finish.
await app.listen({ port: PORT, shutdownDelay: SHUTDOWN_DELAY });
