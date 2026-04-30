import { Job } from "bullmq";
import { transformArticle } from "../services/transformer";
import { TransformJobData } from "../queue";
import { logger } from "../logger";

export async function processTransformJob(
  job: Job<TransformJobData>
): Promise<void> {
  logger.info({ jobId: job.id, articleId: job.data.articleId }, "processing transform");
  await transformArticle(job.data.articleId);
}
