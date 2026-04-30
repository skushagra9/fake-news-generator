import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config";

// BullMQ requires `maxRetriesPerRequest: null` for blocking commands used by
// workers — we use the same connection for the queue producer for simplicity.
export const redisConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const TRANSFORM_QUEUE = "fake-transform";

export type TransformJobData = {
  articleId: string;
};

// Producer side. The worker (worker.ts) creates a separate Worker instance
// against the same queue name.
export const transformQueue = new Queue<TransformJobData>(TRANSFORM_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    // Keep recent jobs around for visibility but cap memory usage.
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
});

export const transformQueueEvents = new QueueEvents(TRANSFORM_QUEUE, {
  connection: redisConnection.duplicate(),
});
