import { config } from "./config";
import { logger } from "./logger";
import { createServer } from "./server";

const app = createServer();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "API listening");
});

// Graceful shutdown so in-flight requests finish before the container dies.
async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down API");
  server.close(() => process.exit(0));
  // Hard kill if shutdown stalls past 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
