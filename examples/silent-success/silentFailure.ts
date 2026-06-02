/**
 * silentFailure — detect a "silent 200": a good-status, non-empty scrape whose content is actually a
 * bot wall, login/paywall gate, error page, or unhydrated shell rather than the page. Pure,
 * deterministic, ~O(n) over the already-extracted markdown — no network, no model.
 *
 * Each heuristic is a pure function returning a Finding or null; detectSilentFailure() runs them all.
 * The four signatures (#1–#4) match only the LEAD of the content: a real page that merely embeds a
 * captcha widget or a cookie banner opens with content, while a wall/error/gate opens with the message.
 *
 * Status: a defensible first pass, hand-set against documented failures — not golden-set calibrated.
 * It reports a symptom; it does not assert the cause.
 */

export type Finding = { code: string; evidence: string };
type Heuristic = (markdown: string) => Finding | null;

/** Strip image syntax and link URLs, keep link/anchor text — a rough proxy for actual prose. */
function readableText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // drop images (and alt text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [label](url) -> label
    .replace(/\s+/g, " ")
    .trim();
}

const LEAD = 600; // chars of leading content a wall/error/gate page opens with
const lead = (md: string) => readableText(md).slice(0, LEAD).toLowerCase();
const rawLead = (md: string) => md.slice(0, 1200).toLowerCase();

// NOTE: a length-based "thin content" heuristic was deliberately rejected. Measured against a
// known-good corpus, real short pages and thin junk overlap completely — example.com (134 readable
// chars) is the same length as the excalidraw JS shell (134) and barely shorter than a real bot
// wall (153). No length threshold separates them, so any length rejector breaks example.com. The
// truly-empty case is already handled upstream by the engine gate's `length > 0` check. So we only
// reject on SPECIFIC signatures below — precision over recall.

// #1 BOT_WALL — challenge copy in the lead, or a dedicated anti-bot asset domain. Deliberately NOT
// matching bare "recaptcha"/"hcaptcha", which appear on real pages that merely embed the widget.
const BOT_COPY =
  /verify you are (a )?human|human verification|are you a robot|checking your browser|press & hold|complete the (security )?check|please solve this captcha|attention required|enable javascript and cookies/;
const BOT_ASSET =
  /perfdrive\.com|captcha-delivery\.com|geo\.captcha|challenges\.cloudflare\.com|funcaptcha|arkoselabs/;
const h2BotWall: Heuristic = md => {
  const m = lead(md).match(BOT_COPY) ?? rawLead(md).match(BOT_ASSET);
  return m
    ? { code: "BOT_WALL", evidence: `anti-bot challenge: "${m[0]}"` }
    : null;
};

// #2 SOFT_ERROR — 200 with an error page the app rendered instead of content.
const ERROR_COPY =
  /something went wrong|a required part of this site couldn.t load|wait a moment and try again|this page (isn.t|is not) working|temporarily unavailable|please try again later/;
const h3SoftError: Heuristic = md => {
  const m = lead(md).match(ERROR_COPY);
  return m
    ? { code: "SOFT_ERROR", evidence: `error page returned: "${m[0]}"` }
    : null;
};

// #3 GATE — login/subscribe/paywall gate where the content should be.
const GATE_COPY =
  /sign up to (get access|read|continue|see)|are you a subscriber|subscribe to (read|continue)|create a (free )?account to|log in to (continue|see)|register to (read|continue)|to continue reading|to (read|access) this (article|document|paper)/;
const h4Gate: Heuristic = md => {
  const m = lead(md).match(GATE_COPY);
  return m ? { code: "GATE", evidence: `access gate: "${m[0]}"` } : null;
};

// #4 PLACEHOLDER — skeleton "Loading…" that never populated. Require the ellipsis/dots so a real
// document that discusses "loading" in prose ("lazy loading", "image loading") is NOT flagged.
const h5Placeholder: Heuristic = md => {
  const n = (readableText(md).match(/loading(?:\.\.\.|…)/gi) ?? []).length;
  return n >= 3
    ? { code: "PLACEHOLDER", evidence: `"Loading…" placeholder ×${n}` }
    : null;
};

const HEURISTICS: Heuristic[] = [h2BotWall, h3SoftError, h4Gate, h5Placeholder];

/** Run all heuristics over the (already main-content-extracted) markdown; empty array = looks real. */
export function detectSilentFailure(markdown: string): Finding[] {
  return HEURISTICS.map(h => h(markdown)).filter(
    (f): f is Finding => f !== null,
  );
}
