import Link from "next/link";
import { routes } from "@/lib/routes";
import { FtlContainer } from "./container";
import { FtlSearchBar } from "./search-bar";
import styles from "./site-header.module.css";
import { FtlSiteNav } from "./site-nav";

export function FtlSiteHeader({ issue = "ISSUE 001" }: { issue?: string } = {}) {
  void issue;

  return (
    <header className={styles.header}>
      <FtlContainer>
        <div className={styles.inner}>
          <Link href={routes.home} className={styles.wordmark} aria-label="From the Loop">
            From <span className={styles.wordmark__italic}>the</span> Loop
          </Link>

          <div className={styles.search}>
            <FtlSearchBar />
          </div>

          <FtlSiteNav />
        </div>
      </FtlContainer>
    </header>
  );
}
