import Link from "next/link";
import styles from "../browse.module.css";

export interface Crumb {
  label: string;
  href?: string; // omit for the current (last) crumb
}

// Breadcrumb trail for the browse hierarchy (Companies › Company › Role ›
// Level). The last crumb is the current page (no link).
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
