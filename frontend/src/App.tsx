import { Link, Route, Routes } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api/client";
import { HomePage } from "./pages/HomePage";
import { ArticlePage } from "./pages/ArticlePage";
import { useState } from "react";

function Masthead() {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);

  const scrape = useMutation({
    mutationFn: () => api.triggerScrape(),
    onSuccess: (res) => {
      const bySource = res.results
        .map(
          (r) =>
            `${r.sourceName}: fetched ${r.fetched}, inserted ${r.inserted}, dupes ${r.duplicates}`
        )
        .join(" · ");

      setMsg([
        `Total: fetched ${res.totals.fetched}, inserted ${res.totals.inserted}, dupes ${res.totals.duplicates}`,
        bySource,
      ].join(" | "));
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      setTimeout(() => setMsg(null), 4000);
    },
    onError: (err: Error) => setMsg(err.message),
  });

  return (
    <header className="masthead">
      <Link to="/" style={{ color: "inherit" }}>
        <h1>The Daily Fabricator</h1>
      </Link>
      <div className="subtitle">All The News That's Fit To Fake</div>
      <div className="actions">
        <button
          className="btn"
          onClick={() => scrape.mutate()}
          disabled={scrape.isPending}
        >
          {scrape.isPending ? "Scraping…" : "Scrape now"}
        </button>
        {msg && <span style={{ alignSelf: "center", fontSize: 13 }}>{msg}</span>}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Masthead />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/articles/:id" element={<ArticlePage />} />
      </Routes>
    </>
  );
}
