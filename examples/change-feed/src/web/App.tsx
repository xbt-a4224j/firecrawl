import { useState } from "react";
import type { FeedItem } from "../watch";

const EXAMPLES = [
  "https://openai.com/api/pricing",
  "https://www.anthropic.com/pricing",
  "https://docs.anthropic.com/en/release-notes/api",
];

const STATUS: Record<string, { dot: string; label: string; border: string }> = {
  changed: { dot: "bg-red-500", label: "CHANGED", border: "border-red-300" },
  minor: { dot: "bg-amber-400", label: "minor change", border: "border-amber-200" },
  same: { dot: "bg-zinc-300", label: "no change", border: "border-zinc-200" },
  new: { dot: "bg-blue-400", label: "NEW (baseline set)", border: "border-blue-200" },
  removed: { dot: "bg-zinc-400", label: "REMOVED", border: "border-zinc-200" },
  error: { dot: "bg-orange-500", label: "ERROR", border: "border-orange-200" },
};
const keyOf = (i: FeedItem) => (i.status === "changed" ? (i.significant ? "changed" : "minor") : i.status);

export function App() {
  const [text, setText] = useState(EXAMPLES.join("\n"));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [credits, setCredits] = useState<{ used: number; remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    const urls = text.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
    if (urls.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setItems(null);
      } else {
        setItems(data.items as FeedItem[]);
        setCredits(data.credits);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">📡 change-feed</h1>
        <p className="text-sm text-zinc-500">
          RSS for anything — watch any page, get told what <em>meaningfully</em> changed (not raw churn).
        </p>
      </header>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        className="w-full rounded-lg border border-zinc-300 p-3 font-mono text-sm focus:border-orange-400 focus:outline-none"
        placeholder="one URL per line"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => void check()}
          disabled={loading}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? "Checking…" : "Check for changes"}
        </button>
        {credits && (
          <span className="text-xs text-zinc-400">
            {credits.used} credits used · {credits.remaining} remaining
          </span>
        )}
        <span className="text-xs text-zinc-400">first run sets baselines (all NEW) — run again to see changes</span>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">⚠ {error}</p>}

      <div className="mt-6 grid gap-3">
        {items?.map((it, i) => {
          const s = STATUS[keyOf(it)]!;
          return (
            <div key={`${it.url}-${i}`} className={`rounded-xl border ${s.border} bg-white p-4 shadow-sm`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.label}</span>
                <a href={it.url} target="_blank" rel="noreferrer" className="truncate text-sm text-zinc-800 hover:underline">
                  {it.url}
                </a>
              </div>
              {it.status === "error" ? (
                <p className="mt-1 text-sm text-red-600">{it.error}</p>
              ) : it.summary ? (
                <p className="mt-1 text-sm text-zinc-700">{it.summary}</p>
              ) : null}
              {it.diff && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-zinc-400">show diff</summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-900 p-2 text-xs leading-relaxed text-zinc-100">
                    {it.diff}
                  </pre>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
