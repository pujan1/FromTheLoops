import styles from "./rule.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type RuleProps = {
  variant?: "default" | "strong" | "ink" | "dashed" | "dotted";
  className?: string;
};

export function Rule({ variant = "default", className }: RuleProps) {
  const variantClass =
    variant === "strong" ? styles["rule--strong"]
    : variant === "ink" ? styles["rule--ink"]
    : variant === "dashed" ? styles["rule--dashed"]
    : variant === "dotted" ? styles["rule--dotted"]
    : "";
  return <hr className={cx(styles.rule, variantClass, className)} aria-hidden="true" />;
}

export function Ornament({ mark = "■", className }: { mark?: string; className?: string }) {
  return (
    <div className={cx(styles.ornament, className)} role="separator" aria-hidden="true">
      <span className={styles.ornament__mark}>{mark}</span>
    </div>
  );
}
