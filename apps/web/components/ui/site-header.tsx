import { Container } from "./container";
import styles from "./site-header.module.css";

export function SiteHeader({ issue = "ISSUE 001" }: { issue?: string }) {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <div className={styles.issue}>
            <span>{issue}</span> · for engineers, by engineers
          </div>

          <a href="/" className={styles.wordmark} aria-label="FromTheLoop">
            From <span className={styles.wordmark__italic}>the</span> Loop
          </a>

          <nav className={styles.nav} aria-label="primary">
            <a href="/companies">Companies</a>
            <a href="/topics">Topics</a>
            <a href="/submit">Submit</a>
            <a href="/sign-in">Sign in</a>
          </nav>
        </div>
      </Container>
    </header>
  );
}
