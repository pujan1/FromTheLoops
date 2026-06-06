import type { CellReportListItem } from "@fromtheloop/db";
import { FtlReportCard } from "@/components/ui";
import { levelLabel, outcomeLabel } from "@/lib/labels";
import { routes } from "@/lib/routes";
import styles from "./reports.module.css";

// Position X — the paginated report list. Maps report rows onto the shared
// ReportCard. company is constant for the surface (passed once); role + level
// ride on each row, so the SAME list renders a single-role page or the company's
// cross-role feed. Skipped-level rows show "Unspecified" (levelLabel), never a
// guessed level. Server component.

export function ReportList({
  items,
  companyName,
  startIndex = 0,
  emptyMessage = "No reports match these filters.",
}: {
  items: CellReportListItem[];
  companyName: string;
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
          role={r.roleName}
          level={levelLabel(r.level)}
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
