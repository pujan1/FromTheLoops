import { type ElementType, type ReactNode } from "react";
import styles from "./card.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "default" | "bordered" | "filled";

type CardProps = {
  as?: ElementType;
  variant?: Variant;
  inset?: boolean;
  interactive?: boolean;
  showArrow?: boolean;
  className?: string;
  children: ReactNode;
};

export function Card({
  as = "article",
  variant = "default",
  inset = false,
  interactive = false,
  showArrow = false,
  className,
  children,
}: CardProps) {
  const Tag = as;
  return (
    <Tag
      className={cx(
        styles.card,
        variant === "bordered" && styles["card--bordered"],
        variant === "filled" && styles["card--filled"],
        inset && styles["card--inset"],
        interactive && styles["card--interactive"],
        className,
      )}
    >
      {children}
      {showArrow && <span className={styles.card__arrow} aria-hidden="true">→</span>}
    </Tag>
  );
}
