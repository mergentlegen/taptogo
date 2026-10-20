export async function register() {
  // Fail fast: validate configuration when the server starts, not on the first request.
  // Skipped during `next build`, where runtime secrets are not expected to be present.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { getEnv } = await import("./env");
    getEnv();
  }
}
