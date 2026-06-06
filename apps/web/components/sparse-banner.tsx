import type { AggregateScope } from "@fromtheloop/core";
import styles from "./sparse-banner.module.css";

// Sparse-data banner (Sprint 4 Day 7). Shown above Position Y whenever the exact
// (company, role, level) cell is below the SPARSE_REPORT_THRESHOLD, so a thin
// sample can't masquerade as a confident signal ("100% offer rate" off two
// reports). The scope comes from core's decideScope(): `role` means the
// company+role corpus across all levels is the broader view to point at; `tag`
// means even that is thin. Either way we link out to the role rollup — the
// honest "wider view" — and the copy reflects which scope we're in.
//
// We deliberately do NOT recompute Position Y over the broadened scope in V1
// (that needs a role-level aggregate); the panel still shows the exact cell, and
// this banner is the contextual caveat that keeps it honest.

const report = (n: number) => (n === 1 ? "report" : "reports");

export function SparseBanner({
  scope,
  exactCount,
  companyName,
  roleName,
  levelName,
  roleCount,
  roleHref,
}: {
  scope: Exclude<AggregateScope, "exact">;
  exactCount: number;
  companyName: string;
  roleName: string;
  levelName: string;
  roleCount: number;
  roleHref: string;
}) {
  return (
    <aside className={styles.banner} role="note">
      <span className={styles.bar} aria-hidden="true" />
      <div className={styles.body}>
        <p className={styles.label}>Small sample</p>
        <p className={styles.text}>
          Only{" "}
          <strong>
            {exactCount} {report(exactCount)}
          </strong>{" "}
          at the {companyName} · {roleName} · {levelName} level. The insights
          below are from this exact level — read them as a starting point, not a
          verdict.
        </p>
        <a className={styles.link} href={roleHref}>
          {scope === "role" ? (
            <>
              See all {roleCount} {roleName} {report(roleCount)} at {companyName}
            </>
          ) : (
            <>
              Browse {roleName} at {companyName} across every level
            </>
          )}
          <span aria-hidden="true"> →</span>
        </a>
      </div>
    </aside>
  );
}
