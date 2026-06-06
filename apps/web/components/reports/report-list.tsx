import type { CellReportListItem } from "@fromtheloop/db";
import { FtlReportCard } from "@/components/ui";
import { outcomeLabel } from "@/lib/labels";
import { routes } from "@/lib/routes";
import styles from "./reports.module.css";

// Position X — the paginated report list. Maps the cell's report rows onto the
// shared ReportCard. company/role are constant for the cell (passed once); each
// card carries the report's own level text, outcome, attribution, round count,
// trust badge, and up to three topic chips. Server component.

export function ReportList({
  items,
  companyName,
  roleName,
  startIndex = 0,
  emptyMessage = "No reports match these filters.",
}: {
  items: CellReportListItem[];
  companyName: string;
  roleName: string;
  // 0-based index of the first item on this page, for the card's running number.
  startIndex?: number;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div className={styles.list}>
      {items.map((r, i) => (
        <FtlReportCard
          key={r.id}
          index={String(startIndex + i + 1).padStart(2, "0")}
          company={companyName}
          role={roleName}
          level={r.level}
          title={outcomeLabel(r.outcome)}
          excerpt={`${r.authorName ?? "Anonymous"} · interviewed ${r.interviewMonth}`}
          rounds={r.roundCount}
          topics={r.topics.map((t) => t.name)}
          verified={r.evidenceVerified}
          postedAt={r.interviewMonth}
          href={routes.report(r.id)}
        />
      ))}
    </div>
  );
}
