import { ChatRole } from "@prisma/client";
import { prisma } from "../db";
import { MODEL, openai } from "./openai";

// We expose a small fixed taxonomy of structured queries plus free-form.
// The frontend renders these as quick-pick chips. Mapping them server-side
// (rather than letting the user write any prompt) means we control the
// prompt and can make response shape predictable for the UI.
export const QUERY_KINDS = [
  "summarize",
  "entities",
  "comparison",
  "freeform",
] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];

export function isQueryKind(x: string): x is QueryKind {
  return (QUERY_KINDS as readonly string[]).includes(x);
}

const SYSTEM_PROMPT_BASE = `You are an assistant answering questions about a single news article.
You have access to BOTH the original (real) version and a satirical (fake) version.
Be concise (2-5 sentences unless asked otherwise). Cite specifics from the article.
If asked about facts, use ONLY the original article, not the satirical one.`;

function buildArticleContext(args: {
  realTitle: string;
  realDescription: string;
  fakeTitle?: string | null;
  fakeDescription?: string | null;
  sourceName: string;
  publishedAt: Date;
}) {
  return `--- ORIGINAL ARTICLE (source: ${args.sourceName}, published: ${args.publishedAt.toISOString()}) ---
Title: ${args.realTitle}
Description: ${args.realDescription}

--- SATIRICAL VERSION ---
Title: ${args.fakeTitle ?? "(not yet generated)"}
Description: ${args.fakeDescription ?? "(not yet generated)"}`;
}

// Map a structured query kind to the user-visible prompt that gets stored
// in chat history. We persist the rendered prompt so the chat replay shows
// what the user effectively asked.
export function promptFor(kind: QueryKind, freeform?: string): string {
  switch (kind) {
    case "summarize":
      return "Summarize this article in 2-3 sentences.";
    case "entities":
      return 'List the key entities mentioned, grouped by type. Respond as JSON: {"people":[],"organizations":[],"locations":[]}.';
    case "comparison":
      return "How does the satirical version differ from the original? What did it exaggerate or invent?";
    case "freeform":
      return (freeform ?? "").trim();
  }
}

type ArticleWithFake = NonNullable<
  Awaited<ReturnType<typeof loadArticle>>
>;

export async function loadArticle(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true, fake: true },
  });
}

// Build the full message list we send to OpenAI: system prompt + article
// context + persisted chat history + the new user turn. We pass the whole
// thread each time so the model has continuity. For long threads we'd
// summarize older turns; for this scope plain replay is fine.
async function buildMessages(
  article: ArticleWithFake,
  newUserContent: string,
  kind: QueryKind
) {
  const history = await prisma.chatMessage.findMany({
    where: { articleId: article.id },
    orderBy: { createdAt: "asc" },
  });

  const systemContent =
    SYSTEM_PROMPT_BASE +
    "\n\n" +
    buildArticleContext({
      realTitle: article.title,
      realDescription: article.description,
      fakeTitle: article.fake?.fakeTitle,
      fakeDescription: article.fake?.fakeDescription,
      sourceName: article.source.name,
      publishedAt: article.publishedAt,
    });

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
  ];

  for (const m of history) {
    if (m.role === ChatRole.SYSTEM) continue; // we already inject system fresh
    messages.push({
      role: m.role === ChatRole.USER ? "user" : "assistant",
      content: m.content,
    });
  }

  messages.push({ role: "user", content: newUserContent });

  void kind; // reserved for future per-kind tweaks
  return messages;
}

// Streaming chat. Yields content chunks; the route layer turns these into
// SSE events. We persist the user message before streaming, and the full
// assistant response after streaming finishes — so a dropped connection
// loses the assistant turn but never the user's question.
export async function* streamChat(
  articleId: string,
  kind: QueryKind,
  freeform?: string
): AsyncGenerator<string, void, unknown> {
  const article = await loadArticle(articleId);
  if (!article) throw new Error("Article not found");

  const userContent = promptFor(kind, freeform);
  if (!userContent) throw new Error("Empty prompt");

  await prisma.chatMessage.create({
    data: {
      articleId,
      role: ChatRole.USER,
      content: userContent,
      queryKind: kind,
    },
  });

  const messages = await buildMessages(article, userContent, kind);

  const stream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    temperature: 0.4,
    messages,
    // For "entities" we want strict JSON. The other kinds are prose.
    ...(kind === "entities"
      ? { response_format: { type: "json_object" as const } }
      : {}),
  });

  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      full += delta;
      yield delta;
    }
  }

  await prisma.chatMessage.create({
    data: {
      articleId,
      role: ChatRole.ASSISTANT,
      content: full,
      queryKind: kind,
    },
  });
}

export async function getChatHistory(articleId: string) {
  return prisma.chatMessage.findMany({
    where: { articleId },
    orderBy: { createdAt: "asc" },
  });
}
