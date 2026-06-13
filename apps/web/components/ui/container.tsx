import { type ElementType, type ReactNode } from "react";
import styles from "./container.module.css";

type Width = "default" | "prose" | "narrow" | "wide";

type ContainerProps<T extends ElementType = "div"> = {
  as?: T;
  width?: Width;
  className?: string;
  children: ReactNode;
};

export function FtlContainer<T extends ElementType = "div">({
  as,
  width = "default",
  className,
  children,
}: ContainerProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const widthClass =
    width === "prose" ? styles.prose
    : width === "narrow" ? styles.narrow
    : width === "wide" ? styles.wide
    : "";
  return (
    <Tag className={[styles.container, widthClass, className].filter(Boolean).join(" ")}>
      {children}
    </Tag>
  );
}
