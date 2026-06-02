/**
 * Corpus runner — scrapes a corpus of pathological + clean URLs through the local Firecrawl API
 * with __experimental_quality on, reads the server-side document.quality, and writes a results
 * table (results.json + results.csv) plus a live console narrative.
 *
 *   npx tsx src/run-corpus.ts                 # one scrape per URL (local default engine)
 *   npx tsx src/run-corpus.ts --engines       # force fetch AND playwright per URL → the F→A grid
 *   FIRECRAWL_API=http://localhost:3002 ...    # override the API base
 *
 * The deterministic pass/fail gate is apps/api/src/lib/quality.test.ts; this is the live demo and
 * is best-effort — sites drift, so dead/blocked URLs are marked, not fatal.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const API = process.env.FIRECRAWL_API ?? "http://localhost:3002";
const args = process.argv.slice(2);
const ENGINES = args.includes("--engines") ? ["fetch", "playwright"] : [undefined];
const CONCURRENCY = 4;

type Row = {
  url: string;
  mode: string;
  issue: number | null;
  expect: string;
  note: string;
};
type Result = {
  url: string;
  mode: string;
  issue: number | null;
  expect: string;
  engine: string;
  ok: boolean;
  status: number;
  rating: string | null;
  findings: string[];
  suggested: string[];
  mdChars: number; // recovered content size — the engine delta shows up here even when the grade doesn't
  latencyMs: number;
  error: string | null;
};

const corpus: Row[] = JSON.parse(
  readFileSync(join(ROOT, "corpus.json"), "utf8"),
).corpus;

async function scrapeOnce(url: string, engine?: string): Promise<Result> {
  const base: Record<string, unknown> = {
    url,
    formats: ["markdown"],
    __experimental_quality: true,
    timeout: 22000,
  };
  if (engine) base.__experimental_forceEngine = engine;
  const t0 = performance.now();
  try {
    const r = await fetch(`${API}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(base),
      signal: AbortSignal.timeout(30000),
    });
    const latencyMs = Math.round(performance.now() - t0);
    const txt = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(txt);
    } catch {
      /* non-json */
    }
    const q = j?.data?.quality;
    const mdChars = (j?.data?.markdown ?? "").length;
    const findings = (q?.findings ?? []).map((f: any) => f.code as string);
    const suggested = (q?.findings ?? [])
      .map((f: any) =>
        f.suggestedFix
          ? `${f.code}:${f.suggestedFix.engine ?? f.suggestedFix.proxy}`
          : null,
      )
      .filter(Boolean) as string[];
    const error = r.ok
      ? j?.success
        ? null
        : (j?.error ?? "no success")
      : `HTTP ${r.status}`;
    return {
      engine: engine ?? "default",
      ok: r.ok && !!j?.success,
      status: r.status,
      rating: q?.rating ?? null,
      findings,
      suggested,
      mdChars,
      latencyMs,
      error,
    } as Result;
  } catch (e: any) {
    return {
      engine: engine ?? "default",
      ok: false,
      status: 0,
      rating: null,
      findings: [],
      suggested: [],
      mdChars: 0,
      latencyMs: Math.round(performance.now() - t0),
      error: e?.name === "TimeoutError" ? "timeout" : String(e?.message ?? e),
    } as Result;
  }
}

const dot = (r: Result) =>
  r.error ? "⚠️ " : r.rating === "A" || r.rating === "B" ? "🟢" : r.rating === "C" || r.rating === "D" ? "🟡" : "🔴";

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

async function main() {
  console.log(
    `\n📊 scrape-quality corpus — ${corpus.length} URLs × ${ENGINES.length} engine(s) via ${API}\n`,
  );
  const results: Result[] = [];
  await mapPool(corpus, CONCURRENCY, async row => {
    for (const engine of ENGINES) {
      const res = await scrapeOnce(row.url, engine);
      const full: Result = { ...row, ...res };
      results.push(full);
      const tag = engine ? `[${engine.padEnd(10)}]` : "";
      const grade = res.error ? "—" : (res.rating ?? "?");
      const detail = res.error
        ? res.error
        : res.findings.length
          ? res.findings.join(",")
          : "clean";
      console.log(
        `${dot(res)} ${grade}  ${tag} ${row.url.replace(/^https?:\/\//, "").padEnd(42)} ${detail}  ${res.mdChars}c  (${res.latencyMs}ms)`,
      );
    }
  });

  // ── aggregates ──
  const graded = results.filter(r => r.rating !== null);
  const dist: Record<string, number> = {};
  for (const r of graded) dist[r.rating!] = (dist[r.rating!] ?? 0) + 1;
  // Did we observe each URL's expected behavior? expect ∈ {"A", a finding code, "ERROR"}.
  // "ERROR" is for hard-block URLs (anti-bot 5xx): the engine fails LOUDLY, so quality() never
  // runs — that's the contrast that defines the silent-200 scope, and observing the error IS the hit.
  const expectedHits = corpus.filter(row => {
    const all = results.filter(r => r.url === row.url);
    if (row.expect === "ERROR") return all.some(r => r.error);
    const got = all.filter(r => !r.error);
    if (!got.length) return false;
    if (row.expect === "A") return got.some(r => r.rating === "A");
    return got.some(r => r.findings.includes(row.expect));
  }).length;
  const errored = results.filter(r => r.error).length;

  console.log("\n── summary ──");
  console.log(`grades: ${JSON.stringify(dist)}`);
  console.log(
    `expected-finding hit rate: ${expectedHits}/${corpus.length} URLs (live, best-effort) · ${errored} engine-calls errored/blocked`,
  );
  if (ENGINES.length === 2) {
    const pair = (row: Row) => ({
      fe: results.find(r => r.url === row.url && r.engine === "fetch"),
      pw: results.find(r => r.url === row.url && r.engine === "playwright"),
    });
    // Two views of the same engine delta:
    //  (1) grade flips — fetch silently returns a 200 the signal grades F; the browser fixes it to A/B.
    //  (2) content recovery — even when the grade doesn't flip, the browser recovers materially more
    //      text. This is the always-present signal; grade flips are the sharp subset of it.
    const flips = corpus.filter(row => {
      const { fe, pw } = pair(row);
      return (
        fe && pw && fe.rating === "F" && (pw.rating === "A" || pw.rating === "B")
      );
    });
    const recovered = corpus
      .map(row => {
        const { fe, pw } = pair(row);
        if (!fe || !pw || fe.error || pw.error) return null;
        const ratio = pw.mdChars / Math.max(fe.mdChars, 1);
        return ratio >= 2 && pw.mdChars - fe.mdChars >= 200
          ? { url: row.url, fe: fe.mdChars, pw: pw.mdChars, ratio }
          : null;
      })
      .filter(Boolean) as { url: string; fe: number; pw: number; ratio: number }[];
    console.log(
      `engine delta — grade flips (fetch:F → playwright:A/B): ${flips.length} URLs${flips.length ? " → " + flips.map(f => f.url.replace(/^https?:\/\//, "")).join(", ") : ""}`,
    );
    console.log(
      `engine delta — content recovery (browser ≥2× fetch): ${recovered.length} URLs`,
    );
    for (const r of recovered.sort((a, b) => b.ratio - a.ratio)) {
      console.log(
        `   ${r.url.replace(/^https?:\/\//, "").padEnd(42)} ${r.fe}c → ${r.pw}c  (${r.ratio.toFixed(1)}×)`,
      );
    }
  }

  // ── write the table ──
  mkdirSync(join(ROOT, "out"), { recursive: true });
  writeFileSync(
    join(ROOT, "out", "results.json"),
    JSON.stringify(results, null, 2),
  );
  const csv = [
    "url,mode,issue,expect,engine,status,rating,findings,md_chars,latency_ms,error",
    ...results.map(r =>
      [
        r.url,
        r.mode,
        r.issue ?? "",
        r.expect,
        r.engine,
        r.status,
        r.rating ?? "",
        `"${r.findings.join(";")}"`,
        r.mdChars,
        r.latencyMs,
        `"${r.error ?? ""}"`,
      ].join(","),
    ),
  ].join("\n");
  writeFileSync(join(ROOT, "out", "results.csv"), csv);
  console.log(`\nwrote out/results.json + out/results.csv\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
