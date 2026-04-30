// BullMQ worker process. Runs as a separate container (see docker-compose.yml)
// so we can scale workers independently of the API. They share the same
// codebase but have different entrypoints.

import { Worker } from "bullmq";
import { redisConnection, TRANSFORM_QUEUE, TransformJobData, transformQueue } from "./queue";
import { processTransformJob } from "./jobs/transform";
import { logger } from "./logger";
import { prisma } from "./db";

const worker = new Worker<TransformJobData>(
  TRANSFORM_QUEUE,
  processTransformJob,
  {
    connection: redisConnection,
    // Tune concurrency based on your OpenAI rate limits. 4 is a safe starting
    // point for gpt-4o-mini on a low-tier account.
    concurrency: 4,
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "job completed");
});
worker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, err: err.message, attempts: job?.attemptsMade },
    "job failed"
  );
});

// ---------------------------------------------------------------------------
// Reconciliation sweep — runs every 5 minutes.
//
// Problem it solves: if a worker crashes mid-job, or Redis loses a job entry
// (e.g. after a restart without AOF), the DB row stays PENDING/PROCESSING
// forever but nothing in the queue will ever pick it up. This sweep finds
// those "orphaned" rows and re-enqueues them so they get processed.
//
// Threshold: we only re-enqueue rows whose updated_at is >5 min old, so we
// don't race with an actively-running job that just hasn't finished yet.
// ---------------------------------------------------------------------------
const RECONCILE_INTERVAL_MS  = 5 * 60 * 1000; // 5 minutes
const STUCK_THRESHOLD_MS     = 5 * 60 * 1000; // row must be untouched for 5 min

async function reconcileStuckJobs() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  // Find rows that are stuck: PENDING or PROCESSING but not touched recently.
  // PROCESSING rows that are genuinely in-flight will have been updated < 5 min
  // ago (the transformer updates status immediately when it starts), so they
  // won't appear here.
  const stuck = await prisma.fakeArticle.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      updatedAt: { lt: cutoff },
    },
    select: { articleId: true, status: true },
  });

  if (stuck.length === 0) return;

  logger.warn({ count: stuck.length }, "reconciler: found stuck jobs, re-enqueuing");

  // Reset to PENDING so the transformer starts from a clean state and the UI
  // shows the correct badge. Then enqueue with a fresh job ID (BullMQ rejects
  // reusing completed/failed job IDs).
  await prisma.fakeArticle.updateMany({
    where: {
      articleId: { in: stuck.map((r) => r.articleId) },
    },
    data: { status: "PENDING", attempts: 0, errorMessage: null },
  });

  let enqueued = 0;
  for (const row of stuck) {
    try {
      await transformQueue.add(
        "transform",
        { articleId: row.articleId },
        { jobId: `transform_${row.articleId}_reconcile_${Date.now()}` }
      );
      enqueued++;
    } catch (err) {
      logger.error({ err, articleId: row.articleId }, "reconciler: failed to enqueue");
    }
  }

  logger.info({ enqueued }, "reconciler: re-enqueue complete");
}

// Schedule the reconciliation sweep.
const reconcileTimer = setInterval(() => {
  reconcileStuckJobs().catch((err) =>
    logger.error({ err }, "reconciler: sweep failed")
  );
}, RECONCILE_INTERVAL_MS);

// Fire once shortly after startup so stuck jobs from a previous crash are
// recovered quickly, without waiting a full 5 minutes.
setTimeout(() => {
  reconcileStuckJobs().catch((err) =>
    logger.error({ err }, "reconciler: initial sweep failed")
  );
}, 15_000);

// ---------------------------------------------------------------------------
// Graceful shutdown — important so Docker's SIGTERM doesn't drop in-flight
// OpenAI requests mid-stream.
// ---------------------------------------------------------------------------
async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down worker");
  clearInterval(reconcileTimer);
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info({ queue: TRANSFORM_QUEUE }, "worker started");
