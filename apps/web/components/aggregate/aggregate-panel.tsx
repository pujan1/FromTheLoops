import type { AggregateInsights } from "@fromtheloop/db";
import { OutcomeBars } from "./outcome-bars";
import { RoundStructure } from "./round-structure";
import { TopTopics } from "./top-topics";
import { TrustSignal } from "./trust-signal";
import styles from "./aggregate.module.css";

// Position Y — the aggregated-insight panel, composed from one aggregate's
// grain-agnostic insight fields (it reads only AggregateInsights, so it renders
// a role-grain OR a level-grain aggregate identically). Order matches the
// wireframe: outcome distribution → trust signal → round structure → top topics.
// Each child returns null when its slice is empty, so a thin aggregate degrades
// gracefully (the sparse-data banner above explains a broadened scope). Server
// component; no client JS.

export function AggregatePanel({
  aggregate,
}: {
  aggregate: AggregateInsights;
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
