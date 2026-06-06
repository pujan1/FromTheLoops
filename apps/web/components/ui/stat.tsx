import { type ReactNode } from "react";
import styles from "./stat.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function FtlStat({
  label,
  value,
  hint,
  accent = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(styles.stat, className)}>
      <span className={styles.stat__label}>{label}</span>
      <span className={cx(styles.stat__value, accent && styles["stat__value--accent"])}>
        {value}
      </span>
      {hint && <span className={styles.stat__hint}>{hint}</span>}
    </div>
  );
}

export function FtlStatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.stats, className)}>{children}</div>;
}
