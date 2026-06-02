/**
 * Report generator — joins corpus.json + out/results.json into a single self-contained
 * motivation.html: the problem (3 diagrams), the heuristics → issues map, and the live results grid.
 *
 *   npx tsx src/run-corpus.ts --engines   # produce out/results.json first
 *   npx tsx src/build-report.ts           # then regenerate motivation.html
 *
 * The data is inlined into the HTML so the page opens straight from disk (file://) with no server —
 * the SVGs are referenced relatively (which file:// allows); only the JSON has to be inlined.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ISSUE = (n: number) => `https://github.com/firecrawl/firecrawl/issues/${n}`;

type Row = { url: string; mode: string; issue: number | null; expect: string; note: string };
type Result = Row & {
  engine: string;
  rating: string | null;
  findings: string[];
  mdChars: number;
  error: string | null;
};

const corpus: Row[] = JSON.parse(readFileSync(join(ROOT, "corpus.json"), "utf8")).corpus;
let results: Result[] = [];
try {
  results = JSON.parse(readFileSync(join(ROOT, "out", "results.json"), "utf8"));
} catch {
  console.error("no out/results.json — run `npx tsx src/run-corpus.ts --engines` first");
  process.exit(1);
}

const engines = [...new Set(results.map(r => r.engine))]; // ["fetch","playwright"] or ["default"]
const at = (url: string, engine: string) => results.find(r => r.url === url && r.engine === engine);

// ── the heuristics → issues map (mirrors apps/api/src/lib/quality.ts) ──
const HEURISTICS = [
  { code: "EMPTY", sev: "high", issues: [385, 684, 666, 1297], what: "200 OK but the markdown is effectively empty — the canonical silent 200." },
  { code: "JS_SHELL", sev: "high", issues: [1345, 1297, 2375], what: "Fetched a JS shell that never hydrated: huge script bundle, ~no text. Suggests a browser engine." },
  { code: "GARBLED", sev: "high", issues: [1142, 1277, 547], what: "Wrong charset → mojibake (UTF-8 decoded as Latin-1). Run-density, so real i18n text is safe." },
  { code: "SOFT_BOT_WALL", sev: "high", issues: [2350, 495, 2413], what: "An anti-bot interstitial returned with a 200. Strong phrase + short page. Suggests a stealth proxy." },
  { code: "HIGH_BOILERPLATE", sev: "medium", issues: [284, 288, 1564, 540], what: "Nav/cookie/footer chrome dominates; little real content. Burns LLM context." },
];

// ── aggregates (same definitions the runner prints) ──
const graded = results.filter(r => r.rating);
const dist: Record<string, number> = {};
for (const r of graded) dist[r.rating!] = (dist[r.rating!] ?? 0) + 1;
const hit = corpus.filter(row => {
  const all = results.filter(r => r.url === row.url);
  if (row.expect === "ERROR") return all.some(r => r.error);
  const got = all.filter(r => !r.error);
  if (!got.length) return false;
  if (row.expect === "A") return got.some(r => r.rating === "A");
  return got.some(r => r.findings.includes(row.expect));
}).length;
const twoEngine = engines.includes("fetch") && engines.includes("playwright");
const flips = !twoEngine ? [] : corpus.filter(row => {
  const fe = at(row.url, "fetch"), pw = at(row.url, "playwright");
  return fe && pw && fe.rating === "F" && (pw.rating === "A" || pw.rating === "B");
});
const recovery = !twoEngine ? [] : corpus
  .map(row => {
    const fe = at(row.url, "fetch"), pw = at(row.url, "playwright");
    if (!fe || !pw || fe.error || pw.error) return null;
    const ratio = pw.mdChars / Math.max(fe.mdChars, 1);
    return ratio >= 2 && pw.mdChars - fe.mdChars >= 200 ? { url: row.url, fe: fe.mdChars, pw: pw.mdChars, ratio } : null;
  })
  .filter(Boolean)
  .sort((a, b) => b!.ratio - a!.ratio) as { url: string; fe: number; pw: number; ratio: number }[];

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const gradeClass = (r: string | null) => (!r ? "err" : r === "A" || r === "B" ? "ok" : r === "F" ? "bad" : "warn");

const BUCKETS: { key: string; title: string; blurb: string }[] = [
  { key: "engine_delta", title: "Engine delta", blurb: "fetch silently returns a near-empty 200; forcing the browser recovers the content." },
  { key: "silent_200", title: "Silent 200", blurb: "fetch returns a 200 the signal grades F; the browser alone can't fix it (needs auth / stealth)." },
  { key: "hard_block", title: "Hard block (out of scope)", blurb: "anti-bot 5xx — the engine fails loudly, so quality() never runs. The contrast that defines the scope." },
  { key: "charset", title: "Charset / i18n", blurb: "non-Latin pages; decoded correctly today → A. GARBLED is the regression guard, correctly silent." },
  { key: "boilerplate", title: "Boilerplate", blurb: "real homepages with heavy chrome — the conservative threshold holds (no false positives)." },
  { key: "control", title: "Controls", blurb: "clean server-rendered content. The false-positive floor at scale." },
];

function gridRows(): string {
  let html = "";
  for (const b of BUCKETS) {
    const rows = corpus.filter(r => r.mode === b.key);
    if (!rows.length) continue;
    html += `<tr class="bucket"><td colspan="${twoEngine ? 6 : 4}"><b>${esc(b.title)}</b> — ${esc(b.blurb)}</td></tr>`;
    for (const row of rows) {
      const cells = engines.map(e => {
        const r = at(row.url, e);
        const grade = r?.error ? "—" : (r?.rating ?? "?");
        const detail = r?.error ? "blocked" : r?.findings.length ? r.findings.join(", ") : "clean";
        return `<td class="g ${gradeClass(r?.rating ?? null)}"><b>${grade}</b><span class="d">${esc(detail)}</span><span class="c">${r?.mdChars ?? 0}c</span></td>`;
      }).join("");
      const issueLink = row.issue ? `<a href="${ISSUE(row.issue)}" target="_blank" rel="noopener">#${row.issue}</a>` : "";
      html += `<tr><td class="u">${esc(row.url.replace(/^https?:\/\//, ""))}</td><td class="x">${esc(row.expect)}</td>${cells}<td class="i">${issueLink}</td></tr>`;
    }
  }
  return html;
}

const headerCells = engines.map(e => `<th>${esc(e)}</th>`).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>scrape-quality — a signal on the pipeline's own output</title>
<style>
  :root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --orange:#c2410c; --blue:#2563eb; --bg:#fafafa; }
  * { box-sizing:border-box; } html { -webkit-text-size-adjust:100%; }
  body { font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); margin:0; }
  .wrap { max-width:1040px; margin:0 auto; padding:40px 24px 80px; }
  h1 { font-size:30px; line-height:1.2; margin:0 0 6px; letter-spacing:-0.02em; }
  .lede { font-size:18px; color:var(--muted); margin:0 0 4px; }
  .sub { font-size:13px; color:var(--muted); margin:0 0 36px; }
  h2 { font-size:20px; margin:48px 0 6px; letter-spacing:-0.01em; }
  h2 .n { color:var(--orange); font-variant-numeric:tabular-nums; }
  .blurb { color:var(--muted); margin:0 0 18px; max-width:70ch; }
  figure { margin:0 0 26px; background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; }
  figure object { width:100%; height:auto; display:block; }
  figcaption { font-size:13px; color:var(--muted); margin-top:10px; text-align:center; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:6px 0 26px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px; }
  .card .big { font-size:26px; font-weight:700; letter-spacing:-0.02em; }
  .card .lbl { font-size:12px; color:var(--muted); margin-top:2px; }
  table { border-collapse:collapse; width:100%; font-size:13.5px; background:#fff; border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); background:#f8fafc; }
  tr:last-child td { border-bottom:none; }
  .htable td.code { font-family:"SF Mono",Menlo,Consolas,monospace; font-weight:600; white-space:nowrap; }
  .htable .sev { font-size:11px; padding:1px 7px; border-radius:999px; }
  .sev.high { background:#fef2f2; color:#b91c1c; } .sev.medium { background:#fffbeb; color:#b45309; }
  .htable a { color:var(--blue); text-decoration:none; margin-right:6px; white-space:nowrap; }
  .grid tr.bucket td { background:#f1f5f9; font-size:13px; color:#334155; }
  .grid td.u { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:12.5px; }
  .grid td.x { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:11.5px; color:var(--muted); }
  .grid td.g { white-space:nowrap; } .grid td.g b { font-size:14px; } .grid td.g .d { display:block; font-size:11px; color:var(--muted); }
  .grid td.g .c { display:block; font-size:10.5px; color:#94a3b8; }
  .grid td.g.ok b { color:#15803d; } .grid td.g.bad b { color:#b91c1c; } .grid td.g.warn b { color:#b45309; } .grid td.g.err b { color:#94a3b8; }
  .grid td.i a { color:var(--blue); text-decoration:none; font-size:12px; }
  ul.lim { color:#334155; max-width:74ch; } ul.lim li { margin:6px 0; }
  code { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:0.88em; background:#f1f5f9; padding:1px 5px; border-radius:5px; }
  .foot { margin-top:48px; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px; color:var(--muted); }
  a.src { color:var(--blue); text-decoration:none; }
</style></head>
<body><div class="wrap">

<h1>A quality signal on the scrape pipeline's own output</h1>
<p class="lede">A 200 OK doesn't mean the content is good. <code>quality(doc)</code> is a cheap, deterministic read on the <b>silent 200</b> — a success response that returned an empty shell, a JS skeleton, mojibake, an anti-bot wall, or pure boilerplate.</p>
<p class="sub">Pure heuristics, ~O(n) over markdown/html, ~0 added latency — runs inline on every scrape. Pass/fail gate: <code>apps/api/src/lib/quality.test.ts</code>. The grid below is live, best-effort.</p>

<h2><span class="n">1</span> · The problem — a silent 200 nobody looked inside</h2>
<p class="blurb">Every engine reports HTTP status. None reports whether the bytes are usable. The gap is invisible until an LLM ingests garbage downstream.</p>
<figure><object data="assets/pitch-1-before-after.svg" type="image/svg+xml"></object><figcaption>Before / after: the pipeline returns 200 + <code>success:true</code> on content that is empty, a shell, or a bot wall.</figcaption></figure>

<h2><span class="n">2</span> · The evidence — recurring grievances, one primitive</h2>
<p class="blurb">The same failure recurs across the tracker under different symptoms. One small primitive names them with a shared vocabulary.</p>
<figure><object data="assets/pitch-2-evidence.svg" type="image/svg+xml"></object><figcaption>Documented issues collapse into five heuristics — each finding cites the issues it addresses.</figcaption></figure>

<h2><span class="n">3</span> · The fix — a joint at a seam that already exists</h2>
<p class="blurb">A transformer in the existing stack, flag-gated, writing a <code>quality</code> field on the document — the same primitive a router or the engpicker calibration could later read to choose an engine.</p>
<figure><object data="assets/pitch-3-insertion.svg" type="image/svg+xml"></object><figcaption>Inserted after content extraction, before the LLM transformers. Off by default (<code>__experimental_quality</code>).</figcaption></figure>

<h2>What it checks — heuristics → customer issues</h2>
<p class="blurb">Each heuristic targets a recurring, documented pain point. Findings are advisory and debuggable: a symptom, evidence, a hint, and a suggested fix.</p>
<table class="htable"><thead><tr><th>Finding</th><th>Severity</th><th>What it catches</th><th>Issues</th></tr></thead><tbody>
${HEURISTICS.map(h => `<tr><td class="code">${h.code}</td><td><span class="sev ${h.sev}">${h.sev}</span></td><td>${esc(h.what)}</td><td>${h.issues.map(n => `<a href="${ISSUE(n)}" target="_blank" rel="noopener">#${n}</a>`).join("")}</td></tr>`).join("\n")}
</tbody></table>

<h2>Live corpus — ${corpus.length} URLs${twoEngine ? " × fetch vs playwright" : ""}</h2>
<div class="cards">
  <div class="card"><div class="big">${graded.length ? Object.entries(dist).map(([g, n]) => `${g}:${n}`).join("  ") : "—"}</div><div class="lbl">grade distribution (${graded.length} graded)</div></div>
  <div class="card"><div class="big">${hit}/${corpus.length}</div><div class="lbl">expected behavior observed</div></div>
  ${twoEngine ? `<div class="card"><div class="big">${flips.length}</div><div class="lbl">grade flips fetch:F → browser:A/B</div></div>
  <div class="card"><div class="big">${recovery.length}</div><div class="lbl">content recovery ≥2× with a browser</div></div>` : ""}
</div>
${twoEngine && recovery.length ? `<p class="blurb"><b>Engine delta:</b> ${recovery.map(r => `${esc(r.url.replace(/^https?:\/\//, ""))} <code>${r.fe}c→${r.pw}c (${r.ratio.toFixed(1)}×)</code>`).join(" · ")}</p>` : ""}
<table class="grid"><thead><tr><th>URL</th><th>expect</th>${headerCells}<th>issue</th></tr></thead><tbody>
${gridRows()}
</tbody></table>

<h2>Honest limitations</h2>
<ul class="lim">
  <li>Thresholds are a defensible <b>first pass</b>, hand-set against documented failures — <b>not</b> golden-set calibrated. Calibrating them on a labelled corpus is the evals work itself.</li>
  <li>It reports a <b>symptom</b>, not a cause: <code>JS_SHELL</code> means "this looks unrendered," not "the proxy failed." The suggested fix is advisory.</li>
  <li><b>Hard blocks are out of scope by design.</b> A 5xx anti-bot response fails loudly; quality() is for the 200s that <i>look</i> fine.</li>
  <li>Most of the modern web server-renders, so the honest live result is "mostly A" — that's the signal <b>not</b> crying wolf. The value concentrates on the client-rendered tail.</li>
</ul>

<div class="foot">Generated from <code>corpus.json</code> + <code>out/results.json</code> by <code>src/build-report.ts</code>. Source: <a class="src" href="../../apps/api/src/lib/quality.ts">apps/api/src/lib/quality.ts</a> · re-run with <code>npm run corpus:engines &amp;&amp; npm run report</code>.</div>

</div></body></html>
`;

writeFileSync(join(ROOT, "motivation.html"), html);
console.log(`wrote motivation.html (${corpus.length} URLs, ${engines.length} engine(s), ${flips.length} flips, ${recovery.length} recoveries)`);
