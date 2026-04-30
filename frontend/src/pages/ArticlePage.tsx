import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

export function ArticlePage() {
  const { id } = useParams<{ id: string }>();
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
              {a.fake?.errorMessage ? `: ${a.fake.errorMessage}` : ""}
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
