export type Source = {
  id: string;
  name: string;
  rssUrl: string;
};

export type FakeStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type Article = {
  id: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  sourceId: string;
  source: { id: string; name: string };
  fake: {
    fakeTitle: string | null;
    fakeDescription: string | null;
    status: FakeStatus;
    modelUsed?: string | null;
    errorMessage?: string | null;
  } | null;
};

export type ChatRole = "USER" | "ASSISTANT" | "SYSTEM";

export type ChatMessage = {
  id: string;
  articleId: string;
  role: ChatRole;
  content: string;
  queryKind: string | null;
  createdAt: string;
};

export type QueryKind = "summarize" | "entities" | "comparison" | "freeform";

export type ScrapeResult = {
  results: Array<{
    sourceName: string;
    fetched: number;
    inserted: number;
    duplicates: number;
  }>;
  totals: { fetched: number; inserted: number; duplicates: number };
};
