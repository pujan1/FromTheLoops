import { type CSSProperties, type ElementType, type ReactNode } from "react";
import styles from "./typography.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type CommonProps = {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
  children: ReactNode;
};

/* ----------------------------- Display ----------------------------- */
type DisplaySize = "lg" | "xl" | "2xl";
export function FtlDisplay({
  as = "h1",
  size = "xl",
  className,
  style,
  id,
  children,
}: CommonProps & { size?: DisplaySize }) {
  const Tag = as;
  const sizeClass =
    size === "2xl" ? styles["display--2xl"]
    : size === "lg" ? styles["display--lg"]
    : styles["display--xl"];
  return (
    <Tag id={id} style={style} className={cx(styles.display, sizeClass, className)}>
      {children}
    </Tag>
  );
}

/* ----------------------------- Heading ----------------------------- */
type HeadingLevel = 1 | 2 | 3;
export function FtlHeading({
  level = 2,
  as,
  className,
  style,
  id,
  children,
}: CommonProps & { level?: HeadingLevel }) {
  const Tag = (as ?? (`h${level}` as ElementType));
  const sizeClass = level === 1 ? styles.h1 : level === 3 ? styles.h3 : styles.h2;
  return (
    <Tag id={id} style={style} className={cx(styles.heading, sizeClass, className)}>
      {children}
    </Tag>
  );
}

/* ----------------------------- Body -----------------------------
   `size` and `tone` are independent — you can be small AND muted.   */
type BodySize = "default" | "small" | "lead";
type BodyTone = "default" | "muted";
export function FtlBody({
  as = "p",
  size = "default",
  tone = "default",
  className,
  style,
  id,
  children,
}: CommonProps & { size?: BodySize; tone?: BodyTone }) {
  const Tag = as;
  return (
    <Tag
      id={id}
      style={style}
      className={cx(
        styles.body,
        size === "small" && styles["body--small"],
        size === "lead" && styles["body--lead"],
        tone === "muted" && styles["body--muted"],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* ----------------------------- Eyebrow ----------------------------- */
export function FtlEyebrow({
  tone = "muted",
  bare = false,
  className,
  style,
  children,
}: {
  tone?: "muted" | "accent" | "ink";
  bare?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const toneClass =
    tone === "accent" ? styles["eyebrow--accent"]
    : tone === "ink" ? styles["eyebrow--ink"]
    : "";
  return (
    <span
      style={style}
      className={cx(styles.eyebrow, toneClass, bare && styles["eyebrow--bare"], className)}
    >
      {children}
    </span>
  );
}

/* ----------------------------- Mono inline ----------------------------- */
export function FtlMono({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return <span style={style} className={cx(styles.mono, className)}>{children}</span>;
}

/* ----------------------------- Caption ----------------------------- */
export function FtlCaption({
  as = "p",
  className,
  style,
  children,
}: CommonProps) {
  const Tag = as;
  return <Tag style={style} className={cx(styles.caption, className)}>{children}</Tag>;
}
