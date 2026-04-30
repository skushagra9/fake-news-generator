import { Router } from "express";
import { prisma } from "../db";
import { transformQueue } from "../queue";
import { scrapeAllSources } from "../services/scraper";

export const scrapeRouter = Router();

// On-demand scrape trigger. We run it inline and return the per-source
// summary so the UI can show a toast like "Inserted 12, 3 duplicates".
//
// For production we'd push this onto the queue too (so the HTTP request
// returns immediately) but the assignment explicitly asks for an API trigger
// and the response shape is more useful when synchronous.
scrapeRouter.post("/", async (_req, res, next) => {
  try {
    const results = await scrapeAllSources();
    const totals = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
        duplicates: acc.duplicates + r.duplicates,
      }),
      { fetched: 0, inserted: 0, duplicates: 0 }
    );
    res.json({ results, totals });
  } catch (err) {
    next(err);
  }
});

// Recovery endpoint: re-enqueue every PENDING or FAILED transform. Useful
// after fixing the OpenAI key, deploying a new prompt, or recovering from a
// burst of upstream errors. The transformer is idempotent on COMPLETED, so
// double-enqueuing is safe. We also reset attempts so BullMQ's
// exponential-backoff schedule starts fresh.
scrapeRouter.post("/retry-failed", async (_req, res, next) => {
  try {
    const stuck = await prisma.fakeArticle.findMany({
      where: { status: { in: ["PENDING", "FAILED"] } },
      select: { articleId: true },
    });

    // Reset status + attempts in a single statement so the worker observes
    // a clean PENDING state when it picks up the requeued job.
    await prisma.fakeArticle.updateMany({
      where: { status: { in: ["PENDING", "FAILED"] } },
      data: { status: "PENDING", attempts: 0, errorMessage: null },
    });

    let enqueued = 0;
    for (const row of stuck) {
      // Use a fresh jobId per retry attempt — BullMQ rejects re-adding a
      // jobId that's already in the queue's completed/failed history.
      await transformQueue.add(
        "transform",
        { articleId: row.articleId },
        { jobId: `transform_${row.articleId}_${Date.now()}` }
      );
      enqueued++;
    }

    res.json({ enqueued });
  } catch (err) {
    next(err);
  }
});
