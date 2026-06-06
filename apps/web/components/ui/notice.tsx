"use client";

import { type ReactNode } from "react";
import styles from "./notice.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Inline notice block: the in-layout feedback surface for a flow's outcome —
// autosave failed, rate limit hit, submission accepted, soft delete confirmed.
// Distinct from a future toast: a Notice sits in the document flow and persists
// until the state changes, rather than floating and auto-dismissing.
//
// Tone maps to the severity tokens. `danger`/`warning` announce assertively
// (role=alert); `info`/`success` announce politely (role=status). Pass
// `onDismiss` to render a close affordance for notices the user can clear.
export type NoticeTone = "info" | "success" | "warning" | "danger";

export function FtlNotice({
  tone = "info",
  title,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
  children,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  const assertive = tone === "danger" || tone === "warning";
  return (
    <div
      className={cx(styles.notice, styles[`notice--${tone}`], className)}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <span className={styles.notice__bar} aria-hidden="true" />
      <div className={styles.notice__body}>
        {title && <p className={styles.notice__title}>{title}</p>}
        {children && <div className={styles.notice__text}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className={styles.notice__dismiss}
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          ×
        </button>
      )}
    </div>
  );
}
