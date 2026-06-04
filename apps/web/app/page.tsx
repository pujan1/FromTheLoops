import Link from "next/link";
import {
  FtlBody,
  FtlButton,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlHeading,
  FtlLinkButton,
  FtlOrnament,
  FtlReportCard,
  FtlSiteHeader,
  FtlStat,
  FtlStatGroup,
  FtlTag,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import styles from "./page.module.css";

const topics = [
  { name: "System design",        count: "184 reports", hint: "high-bar, debate-heavy" },
  { name: "Distributed systems",  count: "112 reports", hint: "consensus · replication" },
  { name: "Behavioral",           count: "247 reports", hint: "STAR · leadership" },
  { name: "Take-home",            count: "63 reports",  hint: "scoring rubrics" },
  { name: "ML systems",           count: "48 reports",  hint: "training + serving" },
  { name: "Frontend depth",       count: "72 reports",  hint: "ui-engineering" },
  { name: "Coding",               count: "203 reports", hint: "live + paired" },
  { name: "Hiring manager",       count: "98 reports",  hint: "the story round" },
];

export default function HomePage() {
  return (
    <>
      <FtlSiteHeader issue="ISSUE 001 · 2026" />

      {/* Ticker */}
      <div style={{ borderBottom: "1px solid var(--color-rule)" }}>
        <FtlContainer>
          <div className={styles.strip}>
            <FtlEyebrow tone="accent" bare>live</FtlEyebrow>
            <span>412 reports</span>
            <span className={styles.strip__sep}>/</span>
            <span>38 companies</span>
            <span className={styles.strip__sep}>/</span>
            <span>68% verified</span>
            <span className={styles.strip__sep}>/</span>
            <span>updated 2 min ago</span>
          </div>
        </FtlContainer>
      </div>

      <main className={styles.page}>
        <FtlContainer>
          {/* -------------- Hero -------------- */}
          <section className={styles.hero}>
            <div className={styles.hero__lead}>
              <FtlEyebrow tone="accent">interview reports</FtlEyebrow>
              <h1 className={styles.hero__headline}>
                <span style={{ fontFamily: "var(--font-display)" }}>
                  From <em style={{ fontStyle: "normal", color: "var(--color-accent)" }}>the</em> loop.
                </span>
              </h1>
              <FtlBody size="lead" className={styles.hero__sub}>
                Structured interview reports for US tech engineering candidates —
                <em style={{ fontStyle: "normal", fontWeight: 600, color: "var(--color-ink)" }}> written by the people who took them.</em>
              </FtlBody>
              <div className={styles.hero__cta}>
                <FtlButton variant="primary" size="lg" trailingArrow>Browse companies</FtlButton>
                <FtlLinkButton variant="ghost" size="lg" href={routes.submit}>Submit a report</FtlLinkButton>
              </div>
            </div>

            <aside className={styles.hero__aside}>
              <FtlEyebrow>masthead</FtlEyebrow>
              <FtlBody size="small" tone="muted" as="div">
                Not reviews of working at a company. Not comp data. Not job
                listings. Just the loop — round by round, question by question,
                tagged so you can find what you actually need.
              </FtlBody>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <FtlTag variant="accent" dot>by candidates</FtlTag>
                <FtlTag variant="ghost">for candidates</FtlTag>
                <FtlTag>verified · trust-weighted</FtlTag>
              </div>
            </aside>
          </section>

          {/* -------------- Stats -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>01 / The corpus</span>
              <div className={styles.section__head__title}>
                <FtlHeading level={2}>What&apos;s already in here.</FtlHeading>
              </div>
              <Link className={styles.section__head__action} href={routes.stats}>all numbers →</Link>
            </div>
            <FtlStatGroup>
              <FtlStat label="reports" value="412" hint="across 38 companies" />
              <FtlStat label="rounds" value="1,847" hint="recruiter → exec-final" />
              <FtlStat label="topics" value="124" hint="curated taxonomy" />
              <FtlStat label="verified" value="68%" accent hint="work-email + LinkedIn" />
            </FtlStatGroup>
          </section>

          {/* -------------- Latest reports -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>02 / Recent reports</span>
              <div className={styles.section__head__title}>
                <FtlHeading level={2}>Fresh from the loops.</FtlHeading>
              </div>
              <Link className={styles.section__head__action} href={routes.reports}>all reports →</Link>
            </div>
            <div>
              <FtlReportCard
                index="01"
                company="Stripe"
                role="Staff SWE"
                level="L5"
                title="A two-week loop, in four acts."
                excerpt="Recruiter screen was vibes-only. First technical was a payments edge-case the interviewer admitted they hadn't seen solved cleanly. System design ran ninety minutes — they actually wanted to debate trade-offs."
                rounds={5}
                topics={["system-design", "payments", "behavioral"]}
                verified
                postedAt="2 days ago"
              />
              <FtlReportCard
                index="02"
                company="Anthropic"
                role="Senior SWE"
                level="L4"
                title="The take-home was the interview."
                excerpt="No live-code. Five-hour take-home with a debrief that probed every design choice. The bar wasn't 'did it work' but 'why this and not that' — bring receipts."
                rounds={3}
                topics={["take-home", "ml-systems", "writing-sample"]}
                verified
                postedAt="5 days ago"
              />
              <FtlReportCard
                index="03"
                company="Linear"
                role="Product Engineer"
                level="L3"
                title="They actually read your portfolio."
                excerpt="The technical was paired-debugging on their open-source repo. Behavioral was structured around three real product calls they had made. Hiring manager called within 36 hours."
                rounds={4}
                topics={["pairing", "product-sense", "ui-engineering"]}
                postedAt="1 week ago"
              />
              <div style={{ borderTop: "1px solid var(--color-rule)" }} />
            </div>
          </section>

          {/* -------------- Pull quote -------------- */}
          <section className={styles.pull}>
            <blockquote className={styles.pull__quote}>
              The interviews are out there. The reports are not. Most candidates
              prep blind — and that&apos;s the gap we&apos;re closing.
            </blockquote>
            <div>
              <FtlEyebrow tone="accent">why this exists</FtlEyebrow>
              <FtlBody style={{ marginTop: 12, maxWidth: "44ch" }}>
                Glassdoor optimizes for HR. LinkedIn optimizes for recruiters.
                Levels optimizes for comp. No one is writing for the person
                walking into the loop next Tuesday. That&apos;s the only reader we
                care about.
              </FtlBody>
              <p className={styles.pull__attr}>— the founding note</p>
            </div>
          </section>

          {/* -------------- Topics -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>03 / By topic</span>
              <div className={styles.section__head__title}>
                <FtlHeading level={2}>Search by what you need to study.</FtlHeading>
              </div>
              <Link className={styles.section__head__action} href={routes.topics}>all topics →</Link>
            </div>
            <div className={styles.topics}>
              {topics.map((t) => (
                <a key={t.name} className={styles.topic} href={routes.topic(t.name.toLowerCase().replace(/\s+/g, "-"))}>
                  <span className={styles.topic__count}>{t.count}</span>
                  <h3 className={styles.topic__name}>{t.name}</h3>
                  <span className={styles.topic__hint}>{t.hint}</span>
                </a>
              ))}
            </div>
          </section>

          <FtlOrnament mark="■" />

          {/* -------------- CTA -------------- */}
          <section className={styles.section} style={{ borderBottom: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "end" }}>
              <FtlDisplay size="lg" as="h2">
                You took the loop. <em>Write it down.</em>
              </FtlDisplay>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <FtlLinkButton href={routes.submit} variant="accent" size="lg" trailingArrow>Submit a report</FtlLinkButton>
                <FtlLinkButton href={routes.about} variant="ghost" size="lg">How submission works</FtlLinkButton>
              </div>
            </div>
          </section>
        </FtlContainer>

        <FtlContainer>
          <footer className={styles.footer}>
            <div>
              <div className={styles.footer__wordmark}>
                From <em style={{ fontStyle: "normal" }}>the</em> Loop
              </div>
              <div style={{ marginTop: 8, maxWidth: "44ch" }}>
                Interview reports straight from the loop. By candidates, for
                candidates. v0 · pre-launch.
              </div>
            </div>
            <div className={styles.footer__cols}>
              <div className={styles.footer__col}>
                <Link href={routes.companies}>Companies</Link>
                <Link href={routes.topics}>Topics</Link>
                <Link href={routes.reports}>Reports</Link>
              </div>
              <div className={styles.footer__col}>
                <Link href={routes.submit}>Submit</Link>
                <Link href={routes.about}>About</Link>
                <Link href={routes.styleguide}>Design</Link>
              </div>
            </div>
          </footer>
        </FtlContainer>
      </main>
    </>
  );
}
