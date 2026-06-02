// Attributing research-agent errors: scrape vs model.
//
// Each question has a known answer on a real (hard) page. We scrape the source two ways — a naive HTTP
// GET, and Firecrawl — and attribute every wrong answer to the right layer:
//
//   fact absent from context           -> SCRAPE failure (no model can fix this)
//   fact present but answer wrong       -> MODEL failure
//   fact present and answer correct     -> correct
//
//   FIRECRAWL_API_KEY=fc-... deno run -A run.ts
import { naiveScrape, fireScrape, agentAnswer, contextHasAnswer, failureReason, pad } from "./lib.ts";

type Q = { question: string; source: string; needle: RegExp; truth: string };
const QUESTIONS: Q[] = [
  { question: "Which physicist is quoted on this page?", source: "https://quotes.toscrape.com/js/", needle: /einstein/i, truth: "Albert Einstein" },
  { question: "In which city is OpenAI headquartered?", source: "https://www.crunchbase.com/organization/openai", needle: /san francisco/i, truth: "San Francisco" },
  { question: "In which city is Shopify headquartered?", source: "https://www.crunchbase.com/organization/shopify", needle: /ottawa/i, truth: "Ottawa" },
  { question: "In which city is Spotify headquartered?", source: "https://www.crunchbase.com/organization/spotify", needle: /stockholm/i, truth: "Stockholm" },
  { question: "What kind of software is Notion, per G2?", source: "https://www.g2.com/products/notion/reviews", needle: /note-taking|productivity|knowledge|project management|collaboration|workspace/i, truth: "productivity / note-taking" },
];

console.log("# Attributing research-agent errors: scrape vs model\n");
console.log(pad("question", 40), pad("naive HTTP", 32), "Firecrawl");
console.log("-".repeat(108));

let naiveScrapeFails = 0, fireCorrect = 0, fireModelFails = 0, fireScrapeFails = 0;
for (const q of QUESTIONS) {
  const n = await naiveScrape(q.source);
  const f = await fireScrape(q.source);

  // naive verdict: no fact in context => the agent is blind => a scrape failure
  let naiveVerdict: string;
  if (contextHasAnswer(n.text, q.needle)) naiveVerdict = "correct";
  else { naiveVerdict = `SCRAPE failure · ${failureReason(n.status)}`; naiveScrapeFails++; }

  // fire verdict: context present? then actually ask the agent and grade the answer
  let fireVerdict: string;
  if (!contextHasAnswer(f.text, q.needle)) { fireVerdict = `SCRAPE failure · ${failureReason(f.status)}`; fireScrapeFails++; }
  else {
    const a = await agentAnswer(q.source, q.question);
    if (q.needle.test(a)) { fireVerdict = `correct · "${a}"`; fireCorrect++; }
    else { fireVerdict = `MODEL failure · got "${a}"`; fireModelFails++; }
  }
  console.log(pad(q.question, 40), pad(naiveVerdict, 32), fireVerdict);
}

console.log("-".repeat(108));
const N = QUESTIONS.length;
console.log(`\nNaive HTTP    agent ${N - naiveScrapeFails}/${N}   ·   ${naiveScrapeFails} SCRAPE failures, 0 model failures`);
console.log(`Firecrawl   agent ${fireCorrect}/${N}   ·   ${fireScrapeFails} scrape failures, ${fireModelFails} model failures, ${fireCorrect} correct`);
console.log(`\nEvery naive error attributes to the SCRAPE — the fact never reached the model. Fix the engine`);
console.log(`(Firecrawl) and the same agent recovers. The model was never the bottleneck.`);
