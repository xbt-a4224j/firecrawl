/**
 * Playground — tweak a scrape config, see the generated SDK code (Node/Python/cURL), scrape, and
 * grade the result. Models how a `quality` panel slots into the existing scrape playground:
 * change a knob, watch the grade move.
 */
import { useState } from "react";
import { generateScrapeSnippets } from "../codegen";
import { QualityPanel } from "./QualityPanel";
import { grade } from "../../scoring/grade";
import { lazyScrapeUrl, type ScrapeFn } from "../grader";
import type { QualityReport } from "../../scoring/grade";
import type { ScrapeTarget } from "../../harness/scrape";

type Lang = "node" | "python" | "curl";
const LANGS: Lang[] = ["node", "python", "curl"];
const LANG_LABEL: Record<Lang, string> = { node: "Node", python: "Python", curl: "cURL" };

export function Playground({ scrapeFn = lazyScrapeUrl }: { scrapeFn?: ScrapeFn }) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<ScrapeTarget>("cloud");
  const [onlyMainContent, setOnlyMainContent] = useState(true);
  const [lang, setLang] = useState<Lang>("node");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const snippets = generateScrapeSnippets(url || "https://example.com", { target, onlyMainContent });

  async function run() {
    const u = url.trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await scrapeFn(u, { target, config: { onlyMainContent } });
      setResult(grade({ ...doc, url: u }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* config */}
        <div className="grid content-start gap-3 rounded-xl border border-zinc-200 bg-white p-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="w-24">target</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as ScrapeTarget)}
              className="rounded-lg border border-zinc-300 px-2 py-1"
            >
              <option value="cloud">cloud</option>
              <option value="local">local</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={onlyMainContent}
              onChange={(e) => setOnlyMainContent(e.target.checked)}
            />
            onlyMainContent (strip nav / chrome)
          </label>
          <button
            type="button"
            onClick={() => void run()}
            disabled={!url.trim() || loading}
            className="mt-1 w-fit rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {loading ? "Grading…" : "Grade"}
          </button>
          {error && <p className="text-sm text-red-600">⚠ {error}</p>}
        </div>

        {/* code */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-900">
          <div className="flex gap-1 border-b border-zinc-700 p-2">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`rounded px-2 py-1 text-xs ${
                  lang === l ? "bg-zinc-700 text-white" : "text-zinc-400"
                }`}
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
          <pre data-testid="snippet" className="overflow-auto p-4 text-xs leading-relaxed text-zinc-100">
            {snippets[lang]}
          </pre>
        </div>
      </div>

      {result && <QualityPanel report={result} />}
    </div>
  );
}
