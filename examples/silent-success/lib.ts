// Minimal helpers for the "context is the bottleneck" example. Targets the Firecrawl CLOUD API.
// Key resolution: FIRECRAWL_API_KEY env var, else a `.fc-key` file in this folder (gitignored).
async function loadKey(): Promise<string> {
  const env = Deno.env.get("FIRECRAWL_API_KEY");
  if (env && env.trim()) return env.trim();
  for (const p of ["./.fc-key", "../.fc-key"]) {
    try { const k = (await Deno.readTextFile(p)).trim(); if (k) return k; } catch { /* next */ }
  }
  return "";
}
const KEY = await loadKey();
if (!KEY) console.error("⚠️  No API key. Set FIRECRAWL_API_KEY or put your key in a .fc-key file in this folder.");
const BASE = Deno.env.get("FIRECRAWL_API") ?? "https://api.firecrawl.dev";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${KEY}` });

export type Pull = { status: number | string; text: string };

/** A homemade scraper: plain HTTP GET, then strip tags. What you have before reaching for an engine. */
export async function naiveScrape(url: string): Promise<Pull> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    const html = await r.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { status: r.status, text };
  } catch {
    return { status: "ERR", text: "" };
  }
}

/** Firecrawl: JS render + proxy rotation + anti-bot, returned as clean markdown.
 *  Hard anti-bot pages occasionally return a transient miss, so we retry a couple of times. */
export async function fireScrape(url: string, tries = 3): Promise<Pull> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(`${BASE}/v2/scrape`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 50000 }),
        signal: AbortSignal.timeout(80000),
      });
      const j = await r.json();
      const text = j?.data?.markdown ?? "";
      if (j.success === true && text.length > 0) return { status: j?.data?.metadata?.statusCode ?? 200, text };
    } catch { /* fall through to retry */ }
    if (attempt < tries) await new Promise((r) => setTimeout(r, 1500));
  }
  return { status: "FAIL", text: "" };
}

/** The agent's answer step — /v2/scrape with a json format (LLM extraction over Firecrawl context). */
export async function agentAnswer(url: string, question: string): Promise<string> {
  try {
    const r = await fetch(`${BASE}/v2/scrape`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        url,
        formats: [{
          type: "json",
          prompt: `${question} Answer in as few words as possible using only the page. If the page does not contain the answer, reply exactly "NOT FOUND".`,
          schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
        }],
        timeout: 60000,
      }),
      signal: AbortSignal.timeout(90000),
    });
    const j = await r.json();
    return String(j?.data?.json?.answer ?? "(error)").trim();
  } catch {
    return "(error)";
  }
}

/** Is the ground-truth fact present in the gathered context? (the only thing a model can use). */
export const contextHasAnswer = (text: string, needle: RegExp) => needle.test(text);

/** Why did a scrape fail to deliver the fact — the clean attribution label. */
export function failureReason(status: number | string): string {
  if (status === 403 || status === 401) return "blocked (anti-bot)";
  if (typeof status === "number" && status >= 200 && status < 300) return "silent 200 (shell/junk body)";
  return `transport error (${status})`;
}

export function pad(s: unknown, n: number): string {
  const x = String(s);
  return x.length >= n ? x.slice(0, n) : x + " ".repeat(n - x.length);
}
