import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ChatPanel } from "../components/ChatPanel";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// How long a row may sit in PENDING/PROCESSING before we treat it as stuck
// and auto-fire a retry. Keep this larger than a normal OpenAI round trip
// (a few seconds) but small enough that the UI feels responsive.
const STUCK_AFTER_MS = 30_000;

export function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showOriginal, setShowOriginal] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["article", id],
    queryFn: () => api.getArticle(id!),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: (query) => {
      const fake = query.state.data?.article.fake;
      const inFlight =
        fake?.status === "PENDING" || fake?.status === "PROCESSING";
      return inFlight ? 3000 : false;
    },
    refetchIntervalInBackground: true,
  });

  const retry = useMutation({
    mutationFn: (articleId: string) => api.retryArticle(articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article", id] });
    },
  });

  // Auto-retry when a row is "stuck" — fire once per (article, updatedAt)
  // pair so we don't hammer the queue when the worker is genuinely slow.
  // The ref keys on `${id}:${updatedAt}` so a successful status flip resets
  // the gate for the next stuck cycle automatically.
  const autoRetryGate = useRef<string | null>(null);
  const fake = data?.article.fake;
  useEffect(() => {
    if (!id || !fake) return;
    if (fake.status !== "PENDING" && fake.status !== "PROCESSING") return;
    if (!fake.updatedAt) return;
    const ageMs = Date.now() - new Date(fake.updatedAt).getTime();
    if (ageMs < STUCK_AFTER_MS) return;
    const key = `${id}:${fake.updatedAt}`;
    if (autoRetryGate.current === key) return;
    autoRetryGate.current = key;
    retry.mutate(id);
  }, [id, fake?.status, fake?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return <div className="container"><div className="empty">Loading…</div></div>;
  }
  if (isError) {
    return (
      <div className="container">
        <div className="error">{(error as Error).message}</div>
      </div>
    );
  }
  if (!data) return null;

  const a = data.article;
  const hasFake = a.fake?.status === "COMPLETED";
  const showFake = !showOriginal && hasFake;
  const title = showFake ? a.fake!.fakeTitle! : a.title;
  const description = showFake ? a.fake!.fakeDescription! : a.description;
  const inFlight =
    a.fake?.status === "PENDING" || a.fake?.status === "PROCESSING";
  const failed = a.fake?.status === "FAILED";
  const canRetry = !!a.fake && a.fake.status !== "COMPLETED";

  return (
    <div className="container">
      <div style={{ marginBottom: 16 }}>
        <Link to="/">← Back to feed</Link>
      </div>

      <div className="detail-grid">
        <article className="article-body">
          <div className="kicker">
            {a.source.name} · {formatDate(a.publishedAt)}
            {a.fake && (
              <>
                {" · "}
                <span className={`status-pill status-${a.fake.status}`}>
                  fake: {a.fake.status.toLowerCase()}
                </span>
              </>
            )}
          </div>
          <h1>{title}</h1>
          <p className="lede">{description}</p>

          {!hasFake && (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              Satirical version is {a.fake?.status.toLowerCase() ?? "pending"}
              {failed && a.fake?.errorMessage ? `: ${a.fake.errorMessage}` : ""}
              {inFlight && " — checking every 3s"}
              {retry.isPending && " · retrying…"}
            </p>
          )}

          <div className="toggle-row">
            {hasFake && (
              <button
                className="btn ghost"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? "Show satirical version" : "Show original"}
              </button>
            )}
            {canRetry && id && (
              <button
                className="btn ghost"
                onClick={() => retry.mutate(id)}
                disabled={retry.isPending}
                title="Re-enqueue the satirical-version job"
              >
                {retry.isPending ? "Retrying…" : failed ? "Retry" : "Retry now"}
              </button>
            )}
            <a
              className="btn ghost"
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source article ↗
            </a>
          </div>
        </article>

        <ChatPanel articleId={a.id} />
      </div>
    </div>
  );
}
