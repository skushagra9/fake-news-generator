import { prisma } from "../db";
import { logger } from "../logger";
import { MODEL, openai } from "./openai";

const SYSTEM_PROMPT = `You are a satirical headline writer in the spirit of The Onion.
Given a real news article (title + description), produce a SATIRICAL version that:
- keeps the underlying topic recognizable (same domain: politics, sports, tech, etc.)
- exaggerates, absurdifies, or finds the comic angle
- stays clearly fake / non-libelous; do not invent quotes from real named people
- avoids slurs, hate speech, or punching down at protected groups
- matches a news-headline register (no emoji, no hashtags)
Respond ONLY with JSON: {"title": string, "description": string}.
description should be 1-2 sentences (max ~280 chars).`;

type TransformResult = { title: string; description: string };

async function callOpenAI(
  realTitle: string,
  realDescription: string
): Promise<TransformResult> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    // JSON mode gives us a guarantee the response is valid JSON. Combined
    // with a strict prompt this is reliable enough for non-critical text.
    response_format: { type: "json_object" },
    temperature: 0.9, // satire benefits from variety
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `REAL TITLE: ${realTitle}\nREAL DESCRIPTION: ${realDescription}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
    throw new Error("OpenAI returned malformed JSON: " + raw.slice(0, 200));
  }
  return { title: parsed.title, description: parsed.description };
}

// Process a single article. Called by the BullMQ worker. We update the
// FakeArticle status as we go so the UI can show "generating…" badges.
export async function transformArticle(articleId: string): Promise<void> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { fake: true },
  });
  if (!article) {
    logger.warn({ articleId }, "transformArticle: article not found");
    return;
  }
  if (article.fake?.status === "COMPLETED") {
    // Already done — idempotent no-op (e.g., job retried after success).
    return;
  }

  await prisma.fakeArticle.update({
    where: { articleId },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  try {
    const fake = await callOpenAI(article.title, article.description);
    await prisma.fakeArticle.update({
      where: { articleId },
      data: {
        fakeTitle: fake.title,
        fakeDescription: fake.description,
        modelUsed: MODEL,
        status: "COMPLETED",
        errorMessage: null,
      },
    });
    logger.info({ articleId }, "transform completed");
  } catch (err: any) {
    // Persist failure but rethrow so BullMQ does its retry/backoff.
    await prisma.fakeArticle.update({
      where: { articleId },
      data: {
        status: "FAILED",
        errorMessage: String(err?.message ?? err).slice(0, 1000),
      },
    });
    logger.error({ err, articleId }, "transform failed");
    throw err;
  }
}
