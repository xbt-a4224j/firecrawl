/**
 * FG-004 — Boilerplate-noise metric.
 *
 * "What a noisy context window does to a model": a scrape that drags nav/footer/cookie/legal cruft
 * into the markdown wastes tokens and degrades retrieval. Classify each line as content or
 * boilerplate and report the signal-to-noise ratio + the offending spans (for highlighting).
 */

export interface NoisySpan {
  text: string;
  reason: "cookie-consent" | "nav" | "footer-legal" | "social";
}

export interface BoilerplateNoiseResult {
  score: number; // 0..100 (higher = cleaner)
  noiseRatio: number; // 0..1
  noisySpans: NoisySpan[];
}

const SIGNATURES: { reason: NoisySpan["reason"]; re: RegExp }[] = [
  {
    reason: "cookie-consent",
    re: /\bcookies?\b|\bconsent\b|\bgdpr\b|\b(accept|reject)\s+all\b|manage\s+(your\s+)?(cookies|preferences|consent)/i,
  },
  { reason: "nav", re: /skip\s+to\s+(main\s+)?content|^\s*(home|menu|navigation)\s*$/i },
  {
    reason: "footer-legal",
    re: /©|copyright|all\s+rights\s+reserved|terms\s+(of|&|and)|privacy\s+policy/i,
  },
  { reason: "social", re: /follow\s+us|^\s*(facebook|twitter|instagram|linkedin|youtube)\s*$/i },
];

function wordCount(line: string): number {
  const trimmed = line.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function classify(line: string): NoisySpan["reason"] | null {
  for (const { reason, re } of SIGNATURES) {
    if (re.test(line)) return reason;
  }
  return null;
}

export function boilerplateNoise(md: string): BoilerplateNoiseResult {
  const lines = md.split("\n");
  const noisySpans: NoisySpan[] = [];
  let totalWords = 0;
  let noiseWords = 0;

  for (const line of lines) {
    const words = wordCount(line);
    if (words === 0) continue;
    totalWords += words;

    const reason = classify(line);
    if (reason) {
      noiseWords += words;
      noisySpans.push({ text: line.trim(), reason });
    }
  }

  const noiseRatio = totalWords === 0 ? 0 : noiseWords / totalWords;
  const score = Math.round(100 * (1 - noiseRatio));
  return { score, noiseRatio, noisySpans };
}
