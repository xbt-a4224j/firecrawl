/**
 * FG-010 — Diff theater. The page as a human sees it (screenshot) next to the markdown an LLM
 * sees, with glued tokens highlighted in place. A "raw" toggle drops the highlighting.
 */
import { useState, type ReactNode } from "react";
import type { QualityReport } from "../../scoring/grade";
import type { Finding } from "../../scoring/types";

export function DiffTheater({ grade }: { grade: QualityReport }) {
  const [raw, setRaw] = useState(false);
  const md = grade.artifacts.markdown;
  const glue = grade.findings.filter((f) => f.code === "INLINE_GLUE" && typeof f.offset === "number");
  const structural = grade.findings.filter((f) => f.code !== "INLINE_GLUE");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
        {grade.artifacts.screenshotUrl ? (
          <img src={grade.artifacts.screenshotUrl} alt="page screenshot" className="w-full" />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
            No screenshot available
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
          <span className="text-xs font-medium text-zinc-500">Markdown (what the LLM sees)</span>
          <button
            type="button"
            onClick={() => setRaw((r) => !r)}
            className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            {raw ? "Rendered" : "Raw"}
          </button>
        </div>

        {structural.length > 0 && (
          <ul className="border-b border-zinc-100 px-3 py-2">
            {structural.map((f, i) => (
              <li key={`${f.code}-${i}`} className="text-xs text-amber-700">
                ⚠ {f.evidence}
              </li>
            ))}
          </ul>
        )}

        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 text-sm text-zinc-800">
          {raw ? md : highlight(md, glue)}
        </pre>
      </div>
    </div>
  );
}

function highlight(md: string, glue: Finding[]): ReactNode[] {
  const ranges = glue
    .map((f) => ({ start: f.offset ?? 0, end: (f.offset ?? 0) + f.evidence.length }))
    .sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start < cursor) return; // skip overlapping highlight
    if (r.start > cursor) nodes.push(<span key={`t${i}`}>{md.slice(cursor, r.start)}</span>);
    nodes.push(
      <mark key={`m${i}`} className="rounded bg-red-200 px-0.5 text-red-900">
        {md.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < md.length) nodes.push(<span key="tail">{md.slice(cursor)}</span>);
  return nodes;
}
