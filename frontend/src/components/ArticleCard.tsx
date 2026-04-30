import { Link } from "react-router-dom";
import type { Article } from "../types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ArticleCard({ article }: { article: Article }) {
  const hasFake = article.fake?.status === "COMPLETED";
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
      ) : article.fake?.status === "FAILED" ? (
        <p className="snippet status-failed">
          Satirical version failed to generate. Showing original: {article.description}
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
