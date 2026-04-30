import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// Single error handler so route code stays clean: throw HttpError(404, ...)
// or pass a ZodError through and we render a consistent JSON envelope.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({ error: "ValidationError", details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  logger.error({ err }, "unhandled error");
  return res.status(500).json({ error: "Internal Server Error" });
}
