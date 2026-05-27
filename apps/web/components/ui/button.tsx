import Link, { type LinkProps } from "next/link";
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./button.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "accent" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  trailingArrow?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  trailingArrow = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        styles.button,
        styles[`variant--${variant}`],
        styles[`size--${size}`],
        className,
      )}
      {...rest}
    >
      {children}
      {trailingArrow && <span className={styles.button__arrow} aria-hidden="true">→</span>}
    </button>
  );
}

/* Anchor variant — same look, semantically a link */
type LinkButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: LinkProps["href"];
  variant?: Variant;
  size?: Size;
  trailingArrow?: boolean;
  children: ReactNode;
};

export function LinkButton({
  variant = "primary",
  size = "md",
  trailingArrow = false,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={cx(
        styles.button,
        styles[`variant--${variant}`],
        styles[`size--${size}`],
        className,
      )}
      {...rest}
    >
      {children}
      {trailingArrow && <span className={styles.button__arrow} aria-hidden="true">→</span>}
    </Link>
  );
}
