import { type ReactNode } from "react";
import styles from "./status-badge.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Semantic status, distinct from the editorial Tag. Tag categorizes content
// (topics, roles); StatusBadge reports state (a report's moderation status, an
// admin queue row, an action outcome) and is keyed on the severity tokens —
// success / warning / danger / pending / info — plus a neutral fallback.
export type BadgeStatus =
  | "success"
  | "warning"
  | "danger"
  | "pending"
  | "info"
  | "neutral";

export function StatusBadge({
  status = "neutral",
  dot = true,
  className,
  children,
}: {
  status?: BadgeStatus;
  // A leading dot reads as a state indicator; drop it for a denser inline badge.
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx(styles.badge, styles[`badge--${status}`], className)}>
      {dot && <span className={styles.badge__dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
