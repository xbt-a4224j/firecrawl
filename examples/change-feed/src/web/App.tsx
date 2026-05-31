import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "../watch";

/** The three real public pages from the signal-vs-noise demo: one reliably red, one noisy, one stable. */
const DEFAULT_URLS = [
  "https://www.coingecko.com/en/coins/bitcoin",
  "https://news.ycombinator.com",
  "https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol",
];

/** One row in a lane's change-log — a single check result, stamped when it arrived. */
interface LogEntry {
  at: number; // client clock (ms) when this poll returned
  status: FeedItem["status"];
  significant: boolean;
  summary: string | null;
  baselineAt: string | null; // server's stored-baseline timestamp this diff ran against (the "DB")
  diff: string | null;
}
interface Lane {
  url: string;
  log: LogEntry[]; // newest first
  lastChangeAt: number | null; // last time it went 🔴/🟡
}

type StatusKey = "changed" | "minor" | "same" | "new" | "removed" | "error" | "idle";
const STATUS: Record<StatusKey, { dot: string; text: string; label: string }> = {
  changed: { dot: "bg-red-500", text: "text-red-700", label: "CHANGED" },
  minor: { dot: "bg-amber-400", text: "text-amber-700", label: "minor change" },
  same: { dot: "bg-zinc-300", text: "text-zinc-400", label: "no change" },
  new: { dot: "bg-blue-400", text: "text-blue-600", label: "NEW · baseline set" },
  removed: { dot: "bg-zinc-400", text: "text-zinc-500", label: "REMOVED" },
  error: { dot: "bg-orange-500", text: "text-orange-700", label: "ERROR" },
  idle: { dot: "bg-zinc-200", text: "text-zinc-400", label: "waiting…" },
};
const keyOf = (status: FeedItem["status"], significant: boolean): StatusKey =>
  status === "changed" ? (significant ? "changed" : "minor") : (status as StatusKey);

const host = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
};
const path = (u: string) => {
  try { const p = new URL(u).pathname; return p === "/" ? "" : p; } catch { return ""; }
};
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });
const utc = (iso: string | null) => {
  if (!iso) return "—";
  const m = iso.match(/T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} UTC` : iso;
};

export function App() {
  const [urls, setUrls] = useState<string[]>(DEFAULT_URLS);
  const [lanes, setLanes] = useState<Record<string, Lane>>({});
  const [running, setRunning] = useState(false);
  const [intervalSec, setIntervalSec] = useState(30);
  const [inFlight, setInFlight] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [polls, setPolls] = useState(0);
  const [credits, setCredits] = useState<{ used: number; remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_URLS.join("\n"));

  // keep latest urls reachable inside the polling closure without restarting the loop
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  async function poll() {
    const targets = urlsRef.current;
    if (targets.length === 0) return;
    setInFlight(true);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: targets }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      const now = Date.now();
      setLanes((prev) => {
        const next = { ...prev };
        for (const it of data.items as FeedItem[]) {
          const lane = next[it.url] ?? { url: it.url, log: [], lastChangeAt: null };
          const entry: LogEntry = {
            at: now,
            status: it.status,
            significant: it.significant,
            summary: it.summary,
            baselineAt: it.previousScrapeAt,
            diff: it.diff,
          };
          next[it.url] = {
            ...lane,
            log: [entry, ...lane.log].slice(0, 25),
            lastChangeAt: it.status === "changed" ? now : lane.lastChangeAt,
          };
        }
        return next;
      });
      if (data.credits) setCredits(data.credits);
      setPolls((p) => p + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInFlight(false);
    }
  }

  // the ping loop: poll immediately, then every intervalSec while running
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await poll();
      if (cancelled) return;
      setCountdown(intervalSec);
      timer = setTimeout(tick, intervalSec * 1000);
    };
    void tick();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, intervalSec]);

  // 1s countdown to the next ping (purely cosmetic)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    if (editing) {
      const parsed = draft.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
      setUrls(parsed.length ? parsed : DEFAULT_URLS);
      setEditing(false);
    }
    setRunning(true);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-900">📡 change-feed — live monitor</h1>
        <p className="text-sm text-zinc-500">
          One lane per site. Every ping diffs against Firecrawl's <strong>server-side baseline store</strong>{" "}
          and tells you what <em>meaningfully</em> changed — red for real, amber for churn.
        </p>
      </header>

      {/* control bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <button
          onClick={() => (running ? setRunning(false) : start())}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${running ? "bg-zinc-700 hover:bg-zinc-800" : "bg-orange-500 hover:bg-orange-600"}`}
        >
          {running ? "■ Stop" : "▶ Start monitoring"}
        </button>

        <label className="flex items-center gap-2 text-sm text-zinc-600">
          ping every
          <input
            type="number"
            min={10}
            value={intervalSec}
            onChange={(e) => setIntervalSec(Math.max(10, Number(e.target.value) || 30))}
            className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          s
        </label>

        <span className="flex items-center gap-1.5 text-sm text-zinc-500">
          <span className={`h-2 w-2 rounded-full ${inFlight ? "animate-pulse bg-green-500" : running ? "bg-green-400" : "bg-zinc-300"}`} />
          {inFlight ? "checking…" : running ? `next ping in ${countdown}s` : "idle"}
        </span>

        <span className="text-xs text-zinc-400">{polls} pings</span>
        {credits && (
          <span className="text-xs text-zinc-400">· {credits.used} credits/ping · {credits.remaining} remaining</span>
        )}

        <button
          onClick={() => setEditing((v) => !v)}
          className="ml-auto text-xs text-zinc-400 underline hover:text-zinc-600"
        >
          {editing ? "done" : "edit sites"}
        </button>
      </div>

      {editing && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          spellCheck={false}
          className="mb-6 w-full rounded-lg border border-zinc-300 p-3 font-mono text-xs focus:border-orange-400 focus:outline-none"
          placeholder="one URL per line"
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600">⚠ {error}</p>}

      {/* swimlanes */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {urls.map((url) => {
          const lane = lanes[url];
          const current = lane?.log[0];
          const sk = current ? keyOf(current.status, current.significant) : "idle";
          const s = STATUS[sk];
          return (
            <div key={url} className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              {/* lane header */}
              <div className="border-b border-zinc-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot} ${sk === "changed" || sk === "minor" ? "animate-pulse" : ""}`} />
                  <a href={url} target="_blank" rel="noreferrer" className="truncate font-semibold text-zinc-800 hover:underline">
                    {host(url)}
                  </a>
                </div>
                <p className="truncate pl-[18px] text-xs text-zinc-400">{path(url) || "/"}</p>
              </div>

              {/* status block */}
              <div className="px-4 py-3">
                <p className={`text-xs font-bold uppercase tracking-wide ${s.text}`}>{s.label}</p>
                {current?.summary && <p className="mt-1 text-sm text-zinc-700">{current.summary}</p>}
              </div>

              {/* facts: last change / last checked / baseline (DB) */}
              <dl className="grid grid-cols-2 gap-y-1 border-y border-zinc-100 bg-zinc-50/60 px-4 py-3 text-xs">
                <dt className="text-zinc-400">Last change</dt>
                <dd className="text-right font-medium text-zinc-700">{lane?.lastChangeAt ? clock(lane.lastChangeAt) : "—"}</dd>
                <dt className="text-zinc-400">Last checked</dt>
                <dd className="text-right font-medium text-zinc-700">{current ? clock(current.at) : "—"}</dd>
                <dt className="text-zinc-400">Baseline (DB)</dt>
                <dd className="text-right font-mono text-zinc-600">{utc(current?.baselineAt ?? null)}</dd>
              </dl>

              {/* DB change-log */}
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  📦 DB change-log
                </p>
                <ol className="space-y-1.5">
                  {(lane?.log ?? []).map((e, i) => {
                    const ek = keyOf(e.status, e.significant);
                    return (
                      <li key={`${e.at}-${i}`} className="flex items-start gap-2 text-xs">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATUS[ek].dot}`} />
                        <span className="shrink-0 font-mono text-zinc-400">{clock(e.at)}</span>
                        <span className={`truncate ${ek === "same" ? "text-zinc-400" : "text-zinc-600"}`}>
                          {e.summary ?? STATUS[ek].label}
                        </span>
                      </li>
                    );
                  })}
                  {!lane && <li className="text-xs text-zinc-300">no checks yet — press Start</li>}
                </ol>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-400">
        Baselines live in Firecrawl's hosted store (Postgres index of last-scrape per (team, url, tag) + the
        snapshot in GCS). Each ping diffs the live page against that baseline, then replaces it.
      </p>
    </div>
  );
}
