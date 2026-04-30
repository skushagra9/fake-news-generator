import pino from "pino";
import { config } from "./config";

export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  // Pretty-print only in dev; in prod we want JSON for ingest pipelines.
  transport:
    config.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});
