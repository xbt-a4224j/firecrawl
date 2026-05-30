/**
 * FG-009 — Report card. A Lighthouse-style summary of a QualityReport: overall score ring,
 * per-dimension bars, and the findings panel.
 */
import type { QualityReport } from "../../scoring/grade";
import type { Finding, Severity } from "../../scoring/types";

const DIM_LABELS: Record<string, string> = {
  structureFidelity: "Structure Fidelity",
  tablesCode: "Tables & Code",
  inlineGlue: "Inline Glue",
  boilerplateNoise: "Boilerplate Noise",
  tokenEfficiency: "Token Efficiency",
  extractionIntegrity: "Extraction Integrity",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
};

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 75) return "text-lime-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function barColor(value: number): string {
  if (value >= 90) return "bg-emerald-500";
  if (value >= 75) return "bg-lime-500";
  if (value >= 60) return "bg-amber-500";
  if (value >= 40) return "bg-orange-500";
  return "bg-red-500";
}

export function ReportCard({ grade }: { grade: QualityReport }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <header className="flex items-center gap-5">
        <ScoreRing score={grade.score} rating={grade.rating} />
        <div className="min-w-0">
          <div className="truncate font-medium text-zinc-900">{grade.url}</div>
          <div className="mt-1 text-sm text-zinc-500">{grade.summary}</div>
        </div>
      </header>

      <div className="mt-6 grid gap-3">
        {Object.entries(grade.dimensions).map(([key, value]) => (
          <Dimension key={key} label={DIM_LABELS[key] ?? key} value={value} />
        ))}
      </div>

      {grade.findings.length > 0 && (
        <ul className="mt-6 grid gap-2">
          {grade.findings.map((f, i) => (
            <FindingRow key={`${f.code}-${i}`} finding={f} />
          ))}
        </ul>
      )}

      <footer className="mt-6 flex gap-4 text-xs text-zinc-400">
        {grade.meta.config && <span>config: {grade.meta.config}</span>}
        {grade.meta.statusCode !== undefined && <span>status: {grade.meta.statusCode}</span>}
        {grade.meta.latencyMs !== undefined && <span>{grade.meta.latencyMs}ms</span>}
      </footer>
    </section>
  );
}

function ScoreRing({ score, rating }: { score: number; rating: string }) {
  return (
    <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-zinc-100">
      <div className={`text-3xl font-bold leading-none ${scoreColor(score)}`}>{score}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-400">{rating}</div>
    </div>
  );
}

function Dimension({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 text-sm text-zinc-600">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value}%` }} />
      </div>
      <div className="w-8 text-right text-sm tabular-nums text-zinc-500">{value}</div>
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[finding.severity]}`}>
        {finding.severity}
      </span>
      <span className="font-mono text-xs text-zinc-700">{finding.code}</span>
      <span className="truncate text-zinc-500">{finding.evidence}</span>
    </li>
  );
}
