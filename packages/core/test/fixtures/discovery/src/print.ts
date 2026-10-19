import app from "./app.js";

// Entry point of the bundle built by the sparkusPlugin() test: prints what the app serves.
await app.init();
process.stdout.write(JSON.stringify(app.routes.map((route) => route.handler)) + "\n");
