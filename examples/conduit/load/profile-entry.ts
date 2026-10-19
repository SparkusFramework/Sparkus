// Starts the app, then exits after PROFILE_EXIT_MS so --cpu-prof writes its profile
// (a killed process writes nothing, and Windows has no SIGTERM to shut down cleanly).
setTimeout(() => process.exit(0), Number(process.env.PROFILE_EXIT_MS) || 60_000).unref();
await import("../src/main.ts");
