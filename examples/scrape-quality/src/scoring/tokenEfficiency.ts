/**
 * FG-005 — Token-efficiency metric.
 *
 * LLM context costs tokens. Two scrapers can both be "correct" but one spends 3x the tokens for the
 * same content. Using a real BPE tokenizer (not chars/4), measure what fraction of the markdown's
 * tokens are actual content vs boilerplate bloat. Reuses FG-004's line classification.
 */
import { encode } from "gpt-tokenizer";
import { boilerplateNoise } from "./boilerplateNoise";

export interface TokenEfficiencyResult {
  score: number; // 0..100
  tokens: number; // total markdown tokens
  contentTokens: number; // tokens after stripping boilerplate lines
  ratio: number; // contentTokens / tokens
}

function tokenCount(s: string): number {
  return s.length === 0 ? 0 : encode(s).length;
}

export function tokenEfficiency(md: string): TokenEfficiencyResult {
  const tokens = tokenCount(md);

  const noisy = new Set(boilerplateNoise(md).noisySpans.map((s) => s.text));
  const contentMd = md
    .split("\n")
    .filter((line) => line.trim().length > 0 && !noisy.has(line.trim()))
    .join("\n");
  const contentTokens = tokenCount(contentMd);

  const ratio = tokens === 0 ? 1 : Math.min(contentTokens / tokens, 1);
  const score = Math.round(ratio * 100);
  return { score, tokens, contentTokens, ratio };
}
