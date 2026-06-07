import Link from "next/link";
import styles from "./breadcrumb.module.css";

export interface Crumb {
  label: string;
  href?: string; // omit for the current (last) crumb
}

// Breadcrumb trail for the browse hierarchies — Companies › Company › Role ›
// Level, and Topics › Topic › Company. The last crumb is the current page (no
// link). Shared across the /companies and /topics surfaces (Sprint 5).
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} style={{ display: "contents" }}>
          {i > 0 && (
            <span className={styles.breadcrumb__sep} aria-hidden="true">
              ›
            </span>
          )}
          {item.href ? (
            <Link href={item.href}>{item.label}</Link>
          ) : (
            <span className={styles.breadcrumb__current} aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
