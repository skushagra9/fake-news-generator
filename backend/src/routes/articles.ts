import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError } from "../middleware/error";
import { transformQueue } from "../queue";
import { logger } from "../logger";

export const articlesRouter = Router();

articlesRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const ListQuery = z.object({
  sourceId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

// Cursor pagination keyed on (publishedAt, id) — stable under concurrent
// inserts, unlike offset pagination which shifts when new rows arrive.
articlesRouter.get("/", async (req, res, next) => {
  try {
    const q = ListQuery.parse(req.query);

    const articles = await prisma.article.findMany({
      where: q.sourceId ? { sourceId: q.sourceId } : undefined,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: q.limit + 1, // peek one extra to know if there's a next page
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        source: { select: { id: true, name: true } },
        fake: {
          select: {
            fakeTitle: true,
            fakeDescription: true,
            status: true,
            // updatedAt powers client-side stuck-detection: if a row has been
            // PENDING/PROCESSING for too long, the UI auto-fires a retry.
            updatedAt: true,
          },
        },
      },
    });

    const hasMore = articles.length > q.limit;
    const slice = hasMore ? articles.slice(0, q.limit) : articles;
    const nextCursor = hasMore ? slice[slice.length - 1].id : null;

    res.json({ articles: slice, nextCursor });
  } catch (err) {
    next(err);
  }
});

articlesRouter.get("/:id", async (req, res, next) => {
  try {
    const article = await prisma.article.findUnique({
      where: { id: req.params.id },
      include: {
        source: { select: { id: true, name: true } },
        fake: true,
      },
    });
    if (!article) throw new HttpError(404, "Article not found");
    res.json({ article });
  } catch (err) {
    next(err);
  }
});

// Per-article retry. The list-wide /api/scrape/retry-failed endpoint only
// covers PENDING and FAILED rows; this one ALSO covers PROCESSING so a row
// stuck because the worker hung mid-call can be unstuck on demand. The
// transformer is idempotent on COMPLETED so a misfire here is harmless.
articlesRouter.post("/:id/retry", async (req, res, next) => {
  try {
    const fake = await prisma.fakeArticle.findUnique({
      where: { articleId: req.params.id },
      select: { articleId: true, status: true },
    });
    if (!fake) throw new HttpError(404, "Article not found");
    if (fake.status === "COMPLETED") {
      // Nothing to do — return current state so the UI can stop polling.
      return res.json({ enqueued: false, status: "COMPLETED" });
    }

    await prisma.fakeArticle.update({
      where: { articleId: fake.articleId },
      data: { status: "PENDING", attempts: 0, errorMessage: null },
    });

    // Fresh jobId per retry — BullMQ rejects re-adding a jobId that's
    // already in the queue's completed/failed history.
    await transformQueue.add(
      "transform",
      { articleId: fake.articleId },
      { jobId: `transform_${fake.articleId}_${Date.now()}` }
    );

    logger.info({ articleId: fake.articleId, prev: fake.status }, "manual retry enqueued");
    res.json({ enqueued: true, status: "PENDING" });
  } catch (err) {
    next(err);
  }
});
