import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ChatMessage, QueryKind } from "../types";

const PRESETS: { kind: QueryKind; label: string }[] = [
  { kind: "summarize", label: "Summarize" },
  { kind: "entities", label: "Key entities" },
  { kind: "comparison", label: "What changed?" },
];

export function ChatPanel({ articleId }: { articleId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["chat", articleId],
    queryFn: () => api.getChat(articleId),
  });

  // The streaming assistant turn lives outside react-query while it's in
  // flight; we merge it with persisted history for display. Once streaming
  // finishes we invalidate and let react-query re-fetch the canonical list.
  const [streaming, setStreaming] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeform, setFreeform] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: ChatMessage[] = data?.messages ?? [];

  useEffect(() => {
    // Auto-scroll on every change so the latest token is visible.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming, pendingUser]);

  async function send(kind: QueryKind, message?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStreaming("");
    setPendingUser(message ?? presetLabel(kind));
    try {
      for await (const ev of api.streamChat(articleId, kind, message)) {
        if (ev.kind === "chunk") {
          setStreaming((s) => (s ?? "") + ev.data);
        } else if (ev.kind === "error") {
          setError(ev.data);
          break;
        } else if (ev.kind === "done") {
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStreaming(null);
      setPendingUser(null);
      // Server has now persisted both turns; re-fetch canonical history.
      queryClient.invalidateQueries({ queryKey: ["chat", articleId] });
    }
  }

  function presetLabel(kind: QueryKind) {
    return PRESETS.find((p) => p.kind === kind)?.label ?? kind;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = freeform.trim();
    if (!trimmed) return;
    setFreeform("");
    send("freeform", trimmed);
  }

  return (
    <aside className="chat-panel">
      <h3>Ask about this article</h3>
      <div className="chat-presets">
        {PRESETS.map((p) => (
          <button
            key={p.kind}
            className="chip"
            disabled={busy}
            onClick={() => send(p.kind)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chat-messages" ref={scrollRef}>
        {isLoading && <div className="empty">Loading history…</div>}
        {!isLoading && messages.length === 0 && !pendingUser && (
          <div className="empty">No conversation yet. Pick a quick action above.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role.toLowerCase()}`}>
            <div className="role">{m.role.toLowerCase()}</div>
            {m.content}
          </div>
        ))}
        {pendingUser && (
          <div className="msg user">
            <div className="role">user</div>
            {pendingUser}
          </div>
        )}
        {streaming !== null && (
          <div className="msg assistant">
            <div className="role">assistant</div>
            {streaming || "…"}
          </div>
        )}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          placeholder="Ask anything…"
          value={freeform}
          onChange={(e) => setFreeform(e.target.value)}
          disabled={busy}
        />
        <button className="btn" type="submit" disabled={busy || !freeform.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
