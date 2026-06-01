/**
 * FG-006 — Inline-glue detector (the #3583 receipt).
 *
 * Issue 3583: adjacent inline elements (<button>/<label>/<span>) with no separating whitespace glue
 * into one markdown token ("FunktionalFunktional", "FunktionalAlways active"). This detector finds
 * those tokens AND cross-references the HTML for adjacent inline siblings — so legitimate long
 * camelCase identifiers (and real words) don't false-positive.
 *
 * Regression guard: "<b>Fire</b><b>crawl</b>" is the word "Firecrawl" — a genuine inline merge that
 * MUST stay glued and unflagged. (This is the nuance that makes PR #3586's blunt dedup wrong.)
 */
import { DEFAULT_CONFIG } from "./config";

export type GlueKind = "repeat" | "camel-seam";

export interface GlueHit {
  token: string; // the original markdown token (for highlighting)
  kind: GlueKind;
  offset: number; // char offset into the markdown
}

export interface InlineGlueResult {
  score: number; // 0..100
  hits: GlueHit[];
}

const INLINE = "button|label|span|b|i|a|strong|em|small|sub|sup|mark|abbr";
// closing inline tag directly followed by an opening inline tag = adjacent inline siblings
const ADJACENT_INLINE = new RegExp(`<\\/(?:${INLINE})>\\s*<(?:${INLINE})[\\s/>]`, "i");

/** Strip markdown emphasis/code markers so "**Fire****crawl**" → "Firecrawl" for analysis. */
function cleanToken(token: string): string {
  return token.replace(/[*_`~]/g, "");
}

function classify(clean: string, repeatMinLen: number, camelSeamMinLen: number): GlueKind | null {
  // exact-repeat: an even-length token whose two halves are identical (e.g. FunktionalFunktional)
  if (clean.length >= repeatMinLen && clean.length % 2 === 0) {
    const half = clean.length / 2;
    if (clean.slice(0, half) === clean.slice(half)) return "repeat";
  }
  // camel-seam: an abnormally long token with a lower→Upper boundary (FunktionalAlways)
  if (clean.length >= camelSeamMinLen && /[a-z][A-Z]/.test(clean)) return "camel-seam";
  return null;
}

export function inlineGlue(
  md: string,
  html: string,
  cfg: { repeatMinLen: number; camelSeamMinLen: number; penaltyPerHit: number } = DEFAULT_CONFIG.inlineGlue,
): InlineGlueResult {
  const gateOpen = ADJACENT_INLINE.test(html);
  const hits: GlueHit[] = [];

  if (gateOpen) {
    for (const m of md.matchAll(/\S+/g)) {
      const token = m[0];
      if (token.includes("`")) continue; // skip inline code
      const clean = cleanToken(token);
      const kind = classify(clean, cfg.repeatMinLen, cfg.camelSeamMinLen);
      if (kind) {
        hits.push({ token, kind, offset: m.index ?? 0 });
      }
    }
  }

  const score = hits.length === 0 ? 100 : Math.max(0, 100 - cfg.penaltyPerHit * hits.length);
  return { score, hits };
}
