/**
 * scrape-quality signal — a cheap, deterministic read on whether a 200 actually returned
 * LLM-ready content, or a silent failure. Each heuristic targets a recurring, documented
 * customer pain point on the tracker:
 *
 *   EMPTY            #385, #684, #666, #1297   200 OK but markdown empty
 *   JS_SHELL         #1345, #1297, #2375       fetched a JS shell; page never hydrated
 *   GARBLED          #1142, #1277, #547        wrong charset → mojibake / replacement chars
 *   SOFT_BOT_WALL    #2350, #495, #2413        anti-bot interstitial returned with a 200
 *   HIGH_BOILERPLATE #284, #288, #1564, #540   nav/cookie/footer chrome dominates content
 *   (clean control: docs pages like jestjs.io must stay A — no false positives)
 *
 * Pure + ~O(n) over markdown/html — no network, no LLM — so it can run inline on every scrape
 * for ~0 added latency (measured in quality.test.ts, not asserted). It reports the SYMPTOM (+ an
 * advisory fix); it does not assert the cause.
 *
 * Honest status: the thresholds below are a defensible FIRST PASS, hand-set against the documented
 * failures — they are NOT golden-set calibrated. Calibrating them on a labelled corpus is the
 * evals work itself, not a finished number. The negative fixtures in the test guard the obvious
 * false positives (real i18n text, a page *about* Cloudflare, an article with a normal footer).
 *
 * Lives in lib/ (next to engpicker) on purpose: the same primitive that surfaces as the user-facing
 * document.quality field can later feed engine selection — quality(tlsclient) vs quality(cdp).
 */

type Rating = "A" | "B" | "C" | "D" | "F";
type Severity = "high" | "medium" | "low";
type FindingCode =
  | "EMPTY"
  | "JS_SHELL"
  | "GARBLED"
  | "SOFT_BOT_WALL"
  | "HIGH_BOILERPLATE";

/** Advisory remediation. Engine ≠ proxy: rendering is an engine, stealth is a proxy mode. */
interface SuggestedFix {
  engine?: "chrome-cdp" | "playwright";
  proxy?: "stealth";
}

interface Finding {
  code: FindingCode;
  severity: Severity;
  /** The recurring issue(s) this symptom corresponds to — concrete, not illustrative. */
  issues: number[];
  /** Concrete numbers/match behind the flag — debuggable, not a black box. */
  evidence: string;
  /** Plain-English, actionable next step. */
  hint: string;
  /** Advisory only — no retry is wired in v1; this is the signal a router/engpicker would read. */
  suggestedFix?: SuggestedFix;
}

export interface QualityReport {
  score: number; // 0–100, continuous
  rating: Rating; // any high-severity finding ⇒ F (a fatal flaw isn't averaged away)
  findings: Finding[];
}

/** The slice of a scrape result quality() reads — self-contained so a full Document satisfies it. */
export interface QualityInput {
  markdown?: string;
  html?: string;
  rawHtml?: string;
}

const DEDUCT: Record<Severity, number> = { high: 70, medium: 25, low: 10 };

function ratingFor(score: number): Rating {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ── heuristics: each returns a Finding or null, and cites the issues it addresses ──────────────

/**
 * JS_SHELL — fetched HTML that never rendered. #1345/#1297 ("empty on self-host, fine on
 * firecrawl.dev"), #2375. Discriminator is the text-to-HTML *ratio*, not raw script count:
 * a real short page with analytics has small HTML; a shell has a huge JS bundle and ~no text.
 */
function jsShell(md: string, rawHtml: string): Finding | null {
  const mdLen = md.trim().length;
  const htmlLen = rawHtml.length;
  if (htmlLen < 5000) return null;
  const textRatio = mdLen / htmlLen;
  const scripts = (rawHtml.match(/<script\b/gi) ?? []).length;
  if (mdLen < 250 && textRatio < 0.004 && scripts >= 3) {
    return {
      code: "JS_SHELL",
      severity: "high",
      issues: [1345, 1297, 2375],
      evidence: `markdown ${mdLen} chars vs raw HTML ${(htmlLen / 1024).toFixed(0)}KB (${(textRatio * 100).toFixed(2)}% text) across ${scripts} <script> tags — shipped JS, not content`,
      hint: "page didn't hydrate — render with a browser engine before converting",
      suggestedFix: { engine: "chrome-cdp" },
    };
  }
  return null;
}

/** EMPTY — the canonical silent 200. #385, #684, #666, #1297. */
function empty(md: string): Finding | null {
  const len = md.trim().length;
  if (len < 30) {
    return {
      code: "EMPTY",
      severity: "high",
      issues: [385, 684, 666, 1297],
      evidence: `markdown is ${len} chars — effectively empty`,
      hint: "no usable content returned — check the render path or whether the page is truly empty",
    };
  }
  return null;
}

/**
 * GARBLED — wrong charset → mojibake. #1142 (Japanese), #1277 (gbk), #547 (Chinese).
 * Mojibake decodes multi-byte UTF-8 as Latin-1 → *runs* of high-range chars; legitimate
 * accented text (café, Köln) has *isolated* ones. So we measure run density, not raw count —
 * that's what stops false positives on real French/German/CJK pages.
 */
function garbled(md: string): Finding | null {
  if (!md.length) return null;
  const runs: string[] = md.match(/[\u0080-\u00FF]{2,}/g) ?? [];
  const runChars = runs.reduce((n, s) => n + s.length, 0);
  const replacement = (md.match(/\uFFFD/g) ?? []).length;
  const suspicious = runChars + replacement * 5;
  const ratio = suspicious / md.length;
  if (suspicious >= 8 && ratio > 0.04) {
    return {
      code: "GARBLED",
      severity: "high",
      issues: [1142, 1277, 547],
      evidence: `${(ratio * 100).toFixed(0)}% of chars are mojibake runs / replacement chars — charset likely misdetected`,
      hint: "text is corrupted — re-decode with the page's declared charset",
    };
  }
  return null;
}

// Strong = unambiguous interstitial copy (fires alone). Weak = terms a real article might use
// (only fire if corroborated by very short content) — so a blog *about* Cloudflare isn't flagged.
const BOT_STRONG = [
  "checking your browser",
  "verify you are human",
  "are you a robot",
  "just a moment",
  "enable javascript and cookies",
  "attention required",
  "ray id",
  "ddos protection",
];
const BOT_WEAK = ["cloudflare", "captcha", "access denied"];

/** SOFT_BOT_WALL — anti-bot interstitial returned with a 200. #2350, #495, #2413 (charged for it). */
function softBotWall(md: string, html: string): Finding | null {
  const hay = (md + " " + html).toLowerCase();
  const len = md.trim().length;
  const strong = BOT_STRONG.find(p => hay.includes(p));
  const weak = BOT_WEAK.find(p => hay.includes(p));
  const matched = strong ?? (len < 300 ? weak : undefined);
  if (matched) {
    return {
      code: "SOFT_BOT_WALL",
      severity: "high",
      issues: [2350, 495, 2413],
      evidence: `anti-bot interstitial returned with a 200 — matched "${matched}"`,
      hint: "blocked by anti-bot — retry behind a stealth proxy",
      suggestedFix: { proxy: "stealth" },
    };
  }
  return null;
}

const BOILER =
  /accept all|cookies?\b|privacy policy|all rights reserved|\u00A9|subscribe|newsletter|follow us|sign ?up|log ?in|\bterms\b|sitemap|careers/gi;

/**
 * HIGH_BOILERPLATE — nav/cookie/footer chrome dominates; little real content. #284, #288,
 * #1564, #540. Per-word density (not raw count) so a long article with a normal footer is fine;
 * only a page that's *mostly* chrome trips it. Medium severity — noisy, not a silent failure.
 */
function highBoilerplate(md: string): Finding | null {
  const text = md.trim();
  if (text.length < 40) return null; // empty()/jsShell() own the thin cases
  const words = text.split(/\s+/).length;
  const boilerHits = (text.match(BOILER) ?? []).length;
  const links = (text.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;
  const ratio = (boilerHits + links * 0.5) / Math.max(words, 1);
  if (boilerHits >= 4 && ratio > 0.08) {
    return {
      code: "HIGH_BOILERPLATE",
      severity: "medium",
      issues: [284, 288, 1564, 540],
      evidence: `${boilerHits} boilerplate markers + ${links} nav links across ~${words} words — mostly chrome`,
      hint: "mostly nav/cookie/footer — onlyMainContent may help; this burns LLM context",
    };
  }
  return null;
}

// ── aggregator ─────────────────────────────────────────────────────────────────────────────────

export function quality(input: QualityInput): QualityReport {
  const md = input.markdown ?? "";
  const html = input.html ?? "";
  const rawHtml = input.rawHtml ?? html;

  const findings: Finding[] = [];
  // jsShell before empty: a tiny-markdown + huge-scripty-HTML page is a shell, not "truly empty"
  const shell = jsShell(md, rawHtml);
  if (shell) findings.push(shell);
  else {
    const e = empty(md);
    if (e) findings.push(e);
  }
  for (const f of [garbled(md), softBotWall(md, html), highBoilerplate(md)]) {
    if (f) findings.push(f);
  }

  let score = 100;
  for (const f of findings) score -= DEDUCT[f.severity];
  score = Math.max(0, Math.min(100, score));
  // Correctness dominates: one fatal (high) finding is F outright, not averaged away.
  const rating: Rating = findings.some(f => f.severity === "high")
    ? "F"
    : ratingFor(score);

  return { score, rating, findings };
}
