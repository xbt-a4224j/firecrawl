/**
 * FG-013 (judge overlay) — an LLM "is this clean context?" rating, ANCHORED to the deterministic
 * metrics so it can't drift to pure vibes. Disagreement (a big gap vs the weighted score) is a
 * feature: it's surfaced, not silently substituted. Graceful no-op when there's no API key.
 *
 * The model call is injectable (`complete`) so the judge is fully testable offline; the default
 * implementation hits the Anthropic API via fetch (no SDK dependency).
 */
import { encode, decode } from "gpt-tokenizer";
import type { QualityReport } from "./scoring/grade";

export interface JudgeVerdict {
  score: number;
  rationale: string;
  agreesWithMetrics: boolean;
  disagreementNote?: string;
}

export interface JudgePrompt {
  system: string;
  user: string;
}

export interface JudgeOptions {
  /** Injectable completion fn (raw model text). If absent, the default Anthropic call is used. */
  complete?: (prompt: JudgePrompt) => Promise<string>;
  apiKey?: string;
  model?: string;
  maxMarkdownTokens?: number;
}

const AGREEMENT_GAP = 15;
const DEFAULT_MAX_MD_TOKENS = 1500;
const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM = [
  "You are a strict evaluator of how well a scraped Markdown document would serve as context for an LLM.",
  '"LLM-readiness" means: the meaningful content is present, correctly structured (headings, tables, code,',
  "lists intact), and not diluted by navigation, cookie/consent, or footer boilerplate. You reward faithful",
  "structure and high signal-to-noise. You are not grading the website — only the Markdown a model receives.",
].join(" ");

function truncateToTokens(text: string, maxTokens: number): string {
  const tokens = encode(text);
  if (tokens.length <= maxTokens) return text;
  return decode(tokens.slice(0, maxTokens)) + " …[truncated]";
}

export function buildJudgePrompt(grade: QualityReport, maxMarkdownTokens = DEFAULT_MAX_MD_TOKENS): JudgePrompt {
  const dims = Object.entries(grade.dimensions)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const findings =
    grade.findings.map((f) => `${f.code} (${f.severity}) "${f.evidence}"`).join("; ") || "none";
  const md = truncateToTokens(grade.artifacts.markdown, maxMarkdownTokens);

  const user = [
    "Score this scrape from 0 to 100 for LLM-readiness.",
    "",
    "Deterministic metrics already computed (treat as strong priors, not gospel):",
    dims,
    `- weighted_overall: ${grade.score}`,
    "",
    `Flagged findings: ${findings}`,
    "",
    "--- MARKDOWN ---",
    md,
    "--- END ---",
    "",
    'Return JSON only: {"score":<0-100>,"rationale":"<one paragraph>",' +
      '"agrees_with_metrics":<true|false>,"disagreement_note":"<if your score differs from ' +
      'weighted_overall by >15, explain why>"}',
  ].join("\n");

  return { system: SYSTEM, user };
}

function parseVerdictJson(raw: string): { score: number; rationale: string; disagreement_note?: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const json = start >= 0 && end >= start ? body.slice(start, end + 1) : body;
  return JSON.parse(json);
}

export async function judge(grade: QualityReport, options: JudgeOptions = {}): Promise<JudgeVerdict | null> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  const complete = options.complete ?? (apiKey ? makeAnthropicCompleter(apiKey, options.model) : null);
  if (!complete) return null;

  const prompt = buildJudgePrompt(grade, options.maxMarkdownTokens);
  const raw = await complete(prompt);
  const parsed = parseVerdictJson(raw);

  const agreesWithMetrics = Math.abs(parsed.score - grade.score) <= AGREEMENT_GAP;
  const verdict: JudgeVerdict = {
    score: parsed.score,
    rationale: parsed.rationale,
    agreesWithMetrics,
  };
  if (parsed.disagreement_note) verdict.disagreementNote = parsed.disagreement_note;
  return verdict;
}

function makeAnthropicCompleter(apiKey: string, model = DEFAULT_MODEL) {
  return async (prompt: JudgePrompt): Promise<string> => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? "";
  };
}
