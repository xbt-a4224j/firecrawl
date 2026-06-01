/**
 * Scrape playground with a quality panel — scrape a page, see the generated SDK code, and grade how
 * LLM-ready the markdown is. (The "State of Scrape Quality" corpus view lives in the CLI:
 * `pnpm build:demo` → STATE-OF-QUALITY.md.)
 */
import { Playground } from "./components/Playground";
import { lazyScrapeUrl, type ScrapeFn } from "./grader";

export function App({ scrapeFn = lazyScrapeUrl }: { scrapeFn?: ScrapeFn }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-900">Scrape Playground</h1>
        <p className="text-sm text-zinc-500">
          Scrape a page and see its <span className="font-medium text-zinc-700">quality</span> — how
          LLM-ready the markdown actually is.
        </p>
      </header>
      <Playground scrapeFn={scrapeFn} />
    </div>
  );
}
