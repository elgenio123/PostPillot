// Runs once when the server starts: creates the tables and the default login.
// Retries while PostgreSQL is still starting, without blocking the web server.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { ready } = await import("./lib/db");
  void (async () => {
    for (let attempt = 1; attempt <= 30; attempt++) {
      try {
        await ready();
        console.log("[postpilot] Database ready");
        return;
      } catch (err) {
        console.log(`[postpilot] Waiting for the database (${attempt}/30): ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();
}
