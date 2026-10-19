import { createApp } from "sparkus";

// Prints what the app serves instead of listening: the test runs the bundle and reads it.
const app = createApp({ logger: false });
await app.init();
process.stdout.write(JSON.stringify(app.routes.map((route) => route.handler)) + "\n");
