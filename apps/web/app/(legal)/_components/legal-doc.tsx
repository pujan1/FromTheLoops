import { type ReactNode } from "react";
import {
  FtlBody,
  FtlCaption,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlHeading,
  FtlNotice,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import styles from "./legal-doc.module.css";

// Shared chrome for the static legal documents (/privacy, /terms, and the
// Day-2 /legal/takedown page). Renders the site header, a prose-width column,
// the document title + "last updated" line, and an optional table of contents
// built from the same section list the page renders — so the TOC can't drift
// out of sync with the headings.

export type LegalSectionDef = { id: string; title: string };

export function LegalDoc({
  title,
  updated,
  intro,
  sections,
  draft = true,
  children,
}: {
  title: string;
  // ISO date the copy was last reviewed; rendered human-readable.
  updated: string;
  intro?: ReactNode;
  // Drives the table of contents; each id must match a <LegalSection id>.
  sections: LegalSectionDef[];
  // While the copy is first-draft / pre-legal-review, show a banner so it can
  // never be mistaken for final text. Flip to false once Termly copy is pasted
  // and you've done the calm-headed review (Sprint 7 checklist).
  draft?: boolean;
  children: ReactNode;
}) {
  const updatedLabel = new Date(updated + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">legal</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 16 }}>
            {title}
          </FtlDisplay>
          <FtlCaption style={{ marginTop: 12, display: "block" }}>
            Last updated{" "}
            <time dateTime={updated}>{updatedLabel}</time>
          </FtlCaption>

          {draft && (
            <FtlNotice tone="warning" title="Working draft" className={styles.draftBanner}>
              First-draft copy pending Termly generation and a final legal review.
              Not yet binding. See the Sprint 7 launch checklist before going live.
            </FtlNotice>
          )}

          {intro && (
            <FtlBody size="lead" tone="muted" className={styles.intro}>
              {intro}
            </FtlBody>
          )}

          <nav className={styles.toc} aria-label="On this page">
            <FtlCaption>On this page</FtlCaption>
            <ol>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <FtlRule />

          <div className={styles.doc}>{children}</div>
        </FtlContainer>
      </main>
    </>
  );
}

// One numbered section with a stable anchor. The anchor lets other pages deep
// link (e.g. the takedown page → the Terms DMCA section) and powers the TOC.
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-h`}>
      <FtlHeading level={2} id={`${id}-h`}>
        {title}
      </FtlHeading>
      {children}
    </section>
  );
}
