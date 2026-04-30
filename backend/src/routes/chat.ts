import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError } from "../middleware/error";
import {
  QUERY_KINDS,
  getChatHistory,
  isQueryKind,
  streamChat,
} from "../services/chatService";
import { logger } from "../logger";

export const chatRouter = Router();

const PostBody = z.object({
  kind: z.enum(QUERY_KINDS),
  // Required when kind === "freeform". For other kinds it's ignored.
  message: z.string().max(2000).optional(),
});

// GET full chat history for an article. Used to hydrate the chat panel on
// page load so refreshes still show prior turns.
chatRouter.get("/:articleId", async (req, res, next) => {
  try {
    const article = await prisma.article.findUnique({
      where: { id: req.params.articleId },
      select: { id: true },
    });
    if (!article) throw new HttpError(404, "Article not found");
    const messages = await getChatHistory(req.params.articleId);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

// POST a new chat turn. Streams the assistant response back as SSE events:
//   event: chunk   data: <text fragment>
//   event: done    data: {}
//   event: error   data: { message }
// We use SSE rather than websockets because it's:
//   - one-direction (server -> client) which fits chat completions exactly,
//   - works through nginx with a single config flag, and
//   - has a built-in browser API (EventSource) — but we use fetch+ReadableStream
//     on the client because EventSource can't send POST bodies.
chatRouter.post("/:articleId", async (req, res, next) => {
  try {
    const { articleId } = req.params;
    const body = PostBody.parse(req.body);

    if (!isQueryKind(body.kind)) {
      throw new HttpError(400, "Invalid query kind");
    }
    if (body.kind === "freeform" && !body.message?.trim()) {
      throw new HttpError(400, "freeform requires a message");
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });
    if (!article) throw new HttpError(404, "Article not found");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders?.();

    try {
      for await (const delta of streamChat(articleId, body.kind, body.message)) {
        res.write(`event: chunk\ndata: ${JSON.stringify(delta)}\n\n`);
      }
      res.write(`event: done\ndata: {}\n\n`);
    } catch (err: any) {
      logger.error({ err, articleId }, "stream chat failed");
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: String(err?.message ?? err) })}\n\n`
      );
    } finally {
      res.end();
    }
  } catch (err) {
    next(err);
  }
});
