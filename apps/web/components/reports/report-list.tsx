import type { CellReportListItem } from "@fromtheloop/db";
import { FtlReportCard } from "@/components/ui";
import { levelLabel, outcomeLabel } from "@/lib/labels";
import { routes } from "@/lib/routes";
import styles from "./reports.module.css";

// Position X — the paginated report list. Maps report rows onto the shared
// ReportCard. role + level ride on each row, so the SAME list renders a
// single-role page or the company's cross-role feed. Company is constant on the
// company/role/level surfaces (pass `companyName` once); on a cross-company feed
// (the user profile) omit it and each row's own company is used. Skipped-level
// rows show "Unspecified" (levelLabel), never a guessed level. Server component.

export function ReportList({
  items,
  companyName,
  startIndex = 0,
  emptyMessage = "No reports match these filters.",
}: {
  items: CellReportListItem[];
  // Constant company label for single-company surfaces. Omit on cross-company
  // feeds (profile) to fall back to each row's own company.
  companyName?: string;
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
          company={companyName ?? r.companyName}
          role={r.roleName}
          level={levelLabel(r.level)}
          title={outcomeLabel(r.outcome)}
          excerpt={
            `${r.authorName ?? "Anonymous"} · interviewed ${r.interviewMonth}` +
            (r.helpfulCount > 0
              ? ` · ${r.helpfulCount} found helpful`
              : "")
          }
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
