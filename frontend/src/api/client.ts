import type {
  Article,
  ChatMessage,
  QueryKind,
  ScrapeResult,
  Source,
} from "../types";

// VITE_API_BASE_URL is empty in compose (we use relative /api proxied by
// nginx). For local dev with a remote backend you can set it at build time.
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listSources: () => http<{ sources: Source[] }>("/api/sources"),

  listArticles: (params: { sourceId?: string; cursor?: string; limit?: number }) => {
    const u = new URLSearchParams();
    if (params.sourceId) u.set("sourceId", params.sourceId);
    if (params.cursor) u.set("cursor", params.cursor);
    if (params.limit) u.set("limit", String(params.limit));
    const qs = u.toString();
    return http<{ articles: Article[]; nextCursor: string | null }>(
      `/api/articles${qs ? `?${qs}` : ""}`
    );
  },

  getArticle: (id: string) =>
    http<{ article: Article }>(`/api/articles/${id}`),

  retryArticle: (id: string) =>
    http<{ enqueued: boolean; status: string }>(
      `/api/articles/${id}/retry`,
      { method: "POST" }
    ),

  triggerScrape: () =>
    http<ScrapeResult>(`/api/scrape`, { method: "POST" }),

  getChat: (articleId: string) =>
    http<{ messages: ChatMessage[] }>(`/api/chat/${articleId}`),

  // Streaming chat. Yields text deltas as the model generates them. We use
  // fetch + ReadableStream because EventSource can't POST a body.
  streamChat: async function* (
    articleId: string,
    kind: QueryKind,
    message?: string
  ): AsyncGenerator<{ kind: "chunk" | "done" | "error"; data: string }, void, unknown> {
    const res = await fetch(`${BASE}/api/chat/${articleId}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by \n\n. Parse out each event.
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }

        if (event === "chunk") {
          yield { kind: "chunk", data: JSON.parse(data) };
        } else if (event === "done") {
          yield { kind: "done", data: "" };
          return;
        } else if (event === "error") {
          yield { kind: "error", data };
          return;
        }
      }
    }
  },
};
