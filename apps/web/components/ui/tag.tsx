import { type ReactNode } from "react";
import styles from "./tag.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type TagVariant = "default" | "ink" | "accent" | "ghost";

export function FtlTag({
  variant = "default",
  dot = false,
  className,
  children,
}: {
  variant?: TagVariant;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const variantClass =
    variant === "ink" ? styles["tag--ink"]
    : variant === "accent" ? styles["tag--accent"]
    : variant === "ghost" ? styles["tag--ghost"]
    : styles["tag--default"];
  return (
    <span className={cx(styles.tag, variantClass, className)}>
      {dot && <span className={styles.tag__dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
