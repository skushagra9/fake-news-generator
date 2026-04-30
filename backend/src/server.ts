import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./logger";
import { errorHandler } from "./middleware/error";
import { articlesRouter } from "./routes/articles";
import { chatRouter } from "./routes/chat";
import { scrapeRouter } from "./routes/scrape";
import { sourcesRouter } from "./routes/sources";

export function createServer() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/sources", sourcesRouter);
  app.use("/api/articles", articlesRouter);
  app.use("/api/scrape", scrapeRouter);
  app.use("/api/chat", chatRouter);

  // Error handler MUST be last.
  app.use(errorHandler);

  return app;
}
