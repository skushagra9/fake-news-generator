import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { ArticleCard } from "../components/ArticleCard";
import { SourceFilter } from "../components/SourceFilter";

export function HomePage() {
  const [sourceId, setSourceId] = useState<string | null>(null);

  const { data: srcData } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.listSources(),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["articles", sourceId],
    queryFn: () =>
      api.listArticles({ sourceId: sourceId ?? undefined, limit: 30 }),
    staleTime: 0,
    // Worker updates fake status asynchronously; poll only while something is still generating.
    refetchInterval: (query) => {
      const articles = query.state.data?.articles ?? [];
      const inFlight = articles.some(
        (a) =>
          a.fake?.status === "PENDING" || a.fake?.status === "PROCESSING"
      );
      return inFlight ? 3000 : false;
    },
    // TanStack only runs interval refetches while the document has focus unless this is true.
    refetchIntervalInBackground: true,
  });

  return (
    <div className="container">
      <SourceFilter
        sources={srcData?.sources ?? []}
        active={sourceId}
        onChange={setSourceId}
      />

      {isLoading && <div className="empty">Loading the day's lies…</div>}
      {isError && (
        <div className="error">
          Failed to load: {(error as Error).message}
        </div>
      )}
      {data && data.articles.length === 0 && (
        <div className="empty">
          No articles yet. Click "Scrape now" above to fetch the latest feeds.
        </div>
      )}

      <div className="feed">
        {data?.articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </div>
  );
}
