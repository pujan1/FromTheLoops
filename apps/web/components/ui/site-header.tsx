import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { FtlContainer } from "./container";
import { FtlSearchBar } from "./search-bar";
import styles from "./site-header.module.css";
import { FtlThemeToggle } from "./theme-toggle";

export function FtlSiteHeader({ issue = "ISSUE 001" }: { issue?: string } = {}) {
  void issue;

  return (
    <header className={styles.header}>
      <FtlContainer>
        <div className={styles.inner}>
          <Link href={routes.home} className={styles.wordmark} aria-label="FromTheLoop">
            From <span className={styles.wordmark__italic}>the</span> Loop
          </Link>

          <div className={styles.actions}>
            <div className={styles.search}>
              <FtlSearchBar />
            </div>
            <nav className={styles.nav} aria-label="primary">
              <Link href={routes.reports}>Experiences</Link>
              <Link href={routes.companies}>Companies</Link>
              <Link href={routes.topics}>Topics</Link>
              <Link href={routes.submit}>Share</Link>
              <Show when="signed-in">
                <Link href={routes.dashboard}>Dashboard</Link>
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
            <FtlThemeToggle />
          </div>
        </div>
      </FtlContainer>
    </header>
  );
}
