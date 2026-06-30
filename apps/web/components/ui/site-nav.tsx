"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { routes } from "@/lib/routes";
import styles from "./site-header.module.css";
import { FtlThemeToggle } from "./theme-toggle";

const links = [
  { href: routes.reports, label: "Experiences" },
  { href: routes.companies, label: "Companies" },
  { href: routes.topics, label: "Topics" },
  { href: routes.submit, label: "Share" },
];

export function FtlSiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navLinks = (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
      <Show when="signed-in">
        <Link href={routes.dashboard}>Dashboard</Link>
      </Show>
    </>
  );

  const authActions = (
    <>
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
    </>
  );

  return (
    <div className={styles.cluster}>
      <nav className={styles.nav} aria-label="primary">
        {navLinks}
      </nav>
      <div className={styles.auth}>{authActions}</div>
      <FtlThemeToggle />
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.menuIcon} data-open={open || undefined} aria-hidden />
      </button>

      <div id={panelId} className={styles.panel} data-open={open || undefined}>
        <nav className={styles.panelNav} aria-label="mobile">
          {navLinks}
        </nav>
        <div className={styles.panelAuth}>{authActions}</div>
      </div>
    </div>
  );
}
