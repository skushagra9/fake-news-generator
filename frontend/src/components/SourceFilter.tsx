import type { Source } from "../types";

type Props = {
  sources: Source[];
  active: string | null;
  onChange: (id: string | null) => void;
};

export function SourceFilter({ sources, active, onChange }: Props) {
  return (
    <div className="filters">
      <button
        className={`chip ${active === null ? "active" : ""}`}
        onClick={() => onChange(null)}
      >
        All sources
      </button>
      {sources.map((s) => (
        <button
          key={s.id}
          className={`chip ${active === s.id ? "active" : ""}`}
          onClick={() => onChange(s.id)}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}
