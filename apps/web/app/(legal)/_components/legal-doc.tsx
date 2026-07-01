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
  updated: string; // ISO date
  intro?: ReactNode;
  // Each id must match a <LegalSection id>.
  sections: LegalSectionDef[];
  // Shows a "not yet binding" banner; flip to false once final copy is reviewed.
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
