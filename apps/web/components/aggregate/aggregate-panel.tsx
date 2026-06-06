import type { CompanyRoleLevelAggregate } from "@fromtheloop/db";
import { OutcomeBars } from "./outcome-bars";
import { RoundStructure } from "./round-structure";
import { TopTopics } from "./top-topics";
import { TrustSignal } from "./trust-signal";
import styles from "./aggregate.module.css";

// Position Y — the aggregated-insight panel, composed from one aggregate row.
// Order matches the wireframe: outcome distribution → trust signal → round
// structure → top topics. Each child returns null when its slice is empty, so a
// thin cell degrades gracefully (the sparse-data banner above it — Day 7 —
// explains a broadened scope). Server component; no client JS.

export function AggregatePanel({
  aggregate,
}: {
  aggregate: CompanyRoleLevelAggregate;
}) {
  return (
    <div className={styles.panel}>
      <OutcomeBars outcome={aggregate.outcome} />
      <TrustSignal
        trustWeightedCount={aggregate.trustWeightedCount}
        reportCount={aggregate.reportCount}
      />
      <RoundStructure
        medianRoundCount={aggregate.medianRoundCount}
        modeRoundSequence={aggregate.modeRoundSequence}
      />
      <TopTopics topics={aggregate.topTopics} />
    </div>
  );
}
