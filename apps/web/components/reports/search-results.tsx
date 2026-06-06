import type { ReportSearchHit } from "@fromtheloop/search";
import { Fragment, type ReactNode } from "react";
import { FtlReportCard } from "@/components/ui";
import { outcomeLabel } from "@/lib/labels";
import { routes } from "@/lib/routes";
import styles from "./reports.module.css";

// Render Typesense's highlighted snippet as React nodes, wrapping each matched
// fragment in <mark>. This is XSS-safe by construction: we split on the literal
// <mark>/</mark> markers Typesense inserts and render every piece as a React
// text child (which React escapes) — the user-submitted prose is never treated
// as HTML, so it can't inject markup. A stray "<mark>" in the source can at
// worst cause a spurious highlight, never script execution.
function highlightSnippet(snippet: string): ReactNode {
  const parts = snippet.split(/<\/?mark>/);
  return parts.map((part, i) =>
    // Odd indices were inside a <mark>…</mark> pair.
    i % 2 === 1 ? (
      <mark key={i}>{part}</mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// Search result list. Maps Typesense hits onto the same ReportCard the wedge
// list uses, so a result reads identically wherever it appears. The match
// fragment becomes the excerpt; with no query (match-all browse) it falls back
// to the interview month. Server component.
export function SearchResults({
  hits,
  startIndex = 0,
}: {
  hits: ReportSearchHit[];
  startIndex?: number;
}) {
  if (hits.length === 0) {
    return null;
  }

  return (
    <div className={styles.list}>
      {hits.map((h, i) => (
        <FtlReportCard
          key={h.id}
          index={String(startIndex + i + 1).padStart(2, "0")}
          company={h.companyName}
          role={h.roleName}
          level={h.level}
          title={outcomeLabel(h.outcome)}
          excerpt={`Interviewed ${h.interviewMonth}`}
          excerptNode={h.snippet ? highlightSnippet(h.snippet) : undefined}
          rounds={h.roundCount}
          topics={h.topicNames}
          verified={h.verified}
          postedAt={h.interviewMonth}
          href={routes.report(h.id)}
        />
      ))}
    </div>
  );
}
