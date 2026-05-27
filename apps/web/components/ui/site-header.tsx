import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Container } from "./container";
import styles from "./site-header.module.css";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ issue = "ISSUE 001" }: { issue?: string }) {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <div className={styles.issue}>
            <span>{issue}</span> · for engineers, by engineers
          </div>

          <Link href="/" className={styles.wordmark} aria-label="FromTheLoop">
            From <span className={styles.wordmark__italic}>the</span> Loop
          </Link>

          <div className={styles.actions}>
            <nav className={styles.nav} aria-label="primary">
              <Link href="/companies">Companies</Link>
              <Link href="/topics">Topics</Link>
              <Link href="/submit">Submit</Link>
              <Show when="signed-in">
                <Link href="/dashboard">Dashboard</Link>
              </Show>
            </nav>
            <div className={styles.auth}>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button type="button" className={styles.authLink}>
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button type="button" className={styles.authPrimary}>
                    Sign up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </Container>
    </header>
  );
}
