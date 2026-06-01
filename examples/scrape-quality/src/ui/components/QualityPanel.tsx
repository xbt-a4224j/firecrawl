/**
 * QualityPanel — the drop-in quality view for a graded scrape: report card + diff theater.
 * Designed to slot into the existing scrape playground next to the markdown output.
 */
import { ReportCard } from "./ReportCard";
import { DiffTheater } from "./DiffTheater";
import type { QualityReport } from "../../scoring/grade";

export function QualityPanel({ report }: { report: QualityReport }) {
  return (
    <div className="grid gap-6">
      <ReportCard grade={report} />
      <DiffTheater grade={report} />
    </div>
  );
}
