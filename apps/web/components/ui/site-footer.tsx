import Link from "next/link";
import { routes } from "@/lib/routes";
import { FtlContainer } from "./container";
import styles from "./site-footer.module.css";

const columns: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Explore",
    links: [
      { href: routes.reports, label: "Experiences" },
      { href: routes.companies, label: "Companies" },
      { href: routes.topics, label: "Topics" },
      { href: routes.submit, label: "Share yours" },
    ],
  },
  {
    heading: "FromTheLoop",
    links: [
      { href: routes.about, label: "About" },
      { href: routes.faq, label: "FAQ" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: routes.privacy, label: "Privacy" },
      { href: routes.terms, label: "Terms" },
      { href: routes.takedown, label: "Content removal" },
    ],
  },
];

export function FtlSiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <FtlContainer>
        <div className={styles.inner}>
          <div className={styles.brand}>
            <Link href={routes.home} className={styles.wordmark} aria-label="From the Loop">
              From <span className={styles.wordmark__italic}>the</span> Loop
            </Link>
            <p className={styles.tagline}>
              Structured interview experiences, written by the people who took them.
            </p>
          </div>

          <nav className={styles.columns} aria-label="Footer">
            {columns.map((col) => (
              <div key={col.heading} className={styles.column}>
                <h2 className={styles.heading}>{col.heading}</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.legalBar}>
          <p className={styles.copyright}>© {year} FromTheLoop</p>
          <p className={styles.disclaimer}>
            Experiences are shared by contributors and not verified. We are the
            host, not the author.
          </p>
        </div>
      </FtlContainer>
    </footer>
  );
}
