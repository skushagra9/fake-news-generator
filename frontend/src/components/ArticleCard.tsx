import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Article } from "../types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ArticleCard({ article }: { article: Article }) {
  const queryClient = useQueryClient();
  const hasFake = article.fake?.status === "COMPLETED";
  const failed = article.fake?.status === "FAILED";

  // Manual retry from the feed — useful for FAILED rows where polling has
  // already stopped (since `inFlight` is false). Invalidating the list
  // refreshes the card immediately and resumes polling once status flips
  // back to PENDING.
  const retry = useMutation({
    mutationFn: () => api.retryArticle(article.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
  });

  return (
    <article className="card">
      <div className="meta">
        {article.source.name} · {formatDate(article.publishedAt)}
        {article.fake && article.fake.status !== "COMPLETED" && (
          <>
            {" · "}
            <span className={`status-pill status-${article.fake.status}`}>
              {article.fake.status.toLowerCase()}
            </span>
          </>
        )}
      </div>
      <h2>
        <Link to={`/articles/${article.id}`}>
          {hasFake ? article.fake!.fakeTitle : article.title}
        </Link>
      </h2>
      {hasFake ? (
        <p className="snippet">{article.fake!.fakeDescription}</p>
      ) : failed ? (
        <p className="snippet status-failed">
          Satirical version failed to generate. Showing original: {article.description}
          <br />
          <button
            className="btn ghost"
            style={{ marginTop: 8 }}
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            {retry.isPending ? "Retrying…" : "Retry"}
          </button>
        </p>
      ) : (
        <p className="snippet pending">
          Generating satirical version… (showing original)
          <br />
          {article.description}
        </p>
      )}
    </article>
  );
}
