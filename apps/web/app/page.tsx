import Link from "next/link";
import {
  Body,
  Button,
  Container,
  Display,
  Eyebrow,
  Heading,
  LinkButton,
  Ornament,
  ReportCard,
  SiteHeader,
  Stat,
  StatGroup,
  Tag,
} from "@/components/ui";
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
      <SiteHeader issue="ISSUE 001 · 2026" />

      {/* Ticker */}
      <div style={{ borderBottom: "1px solid var(--color-rule)" }}>
        <Container>
          <div className={styles.strip}>
            <Eyebrow tone="accent" bare>live</Eyebrow>
            <span>412 reports</span>
            <span className={styles.strip__sep}>/</span>
            <span>38 companies</span>
            <span className={styles.strip__sep}>/</span>
            <span>68% verified</span>
            <span className={styles.strip__sep}>/</span>
            <span>updated 2 min ago</span>
          </div>
        </Container>
      </div>

      <main className={styles.page}>
        <Container>
          {/* -------------- Hero -------------- */}
          <section className={styles.hero}>
            <div className={styles.hero__lead}>
              <Eyebrow tone="accent">interview reports</Eyebrow>
              <h1 className={styles.hero__headline}>
                <span style={{ fontFamily: "var(--font-display)" }}>
                  From <em style={{ fontStyle: "italic", color: "var(--color-accent)" }}>the</em> loop.
                </span>
              </h1>
              <Body size="lead" className={styles.hero__sub}>
                Structured interview reports for US tech engineering candidates —
                <em style={{ fontFamily: "var(--font-display)", fontSize: "1.15em", color: "var(--color-accent)" }}> written by the people who took them.</em>
              </Body>
              <div className={styles.hero__cta}>
                <Button variant="primary" size="lg" trailingArrow>Browse companies</Button>
                <LinkButton variant="ghost" size="lg" href="/submit">Submit a report</LinkButton>
              </div>
            </div>

            <aside className={styles.hero__aside}>
              <Eyebrow>masthead</Eyebrow>
              <Body size="small" tone="muted" as="div">
                Not reviews of working at a company. Not comp data. Not job
                listings. Just the loop — round by round, question by question,
                tagged so you can find what you actually need.
              </Body>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Tag variant="accent" dot>by candidates</Tag>
                <Tag variant="ghost">for candidates</Tag>
                <Tag>verified · trust-weighted</Tag>
              </div>
            </aside>
          </section>

          {/* -------------- Stats -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>§ 01 — The corpus</span>
              <div className={styles.section__head__title}>
                <Heading level={2}>What&apos;s already in here.</Heading>
              </div>
              <Link className={styles.section__head__action} href="/stats">all numbers →</Link>
            </div>
            <StatGroup>
              <Stat label="reports" value="412" hint="across 38 companies" />
              <Stat label="rounds" value="1,847" hint="recruiter → exec-final" />
              <Stat label="topics" value="124" hint="curated taxonomy" />
              <Stat label="verified" value="68%" accent hint="work-email + LinkedIn" />
            </StatGroup>
          </section>

          {/* -------------- Latest reports -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>§ 02 — Recent reports</span>
              <div className={styles.section__head__title}>
                <Heading level={2}>Fresh from the loops.</Heading>
              </div>
              <Link className={styles.section__head__action} href="/reports">all reports →</Link>
            </div>
            <div>
              <ReportCard
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
              <ReportCard
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
              <ReportCard
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
              <Eyebrow tone="accent">why this exists</Eyebrow>
              <Body style={{ marginTop: 12, maxWidth: "44ch" }}>
                Glassdoor optimizes for HR. LinkedIn optimizes for recruiters.
                Levels optimizes for comp. No one is writing for the person
                walking into the loop next Tuesday. That&apos;s the only reader we
                care about.
              </Body>
              <p className={styles.pull__attr}>— the founding note</p>
            </div>
          </section>

          {/* -------------- Topics -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>§ 03 — By topic</span>
              <div className={styles.section__head__title}>
                <Heading level={2}>Search by what you need to study.</Heading>
              </div>
              <Link className={styles.section__head__action} href="/topics">all topics →</Link>
            </div>
            <div className={styles.topics}>
              {topics.map((t) => (
                <a key={t.name} className={styles.topic} href={`/topics/${t.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <span className={styles.topic__count}>{t.count}</span>
                  <h3 className={styles.topic__name}>{t.name}</h3>
                  <span className={styles.topic__hint}>{t.hint}</span>
                </a>
              ))}
            </div>
          </section>

          <Ornament mark="§" />

          {/* -------------- CTA -------------- */}
          <section className={styles.section} style={{ borderBottom: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "end" }}>
              <Display size="lg" as="h2">
                You took the loop. <em>Write it down.</em>
              </Display>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <LinkButton href="/submit" variant="accent" size="lg" trailingArrow>Submit a report</LinkButton>
                <LinkButton href="/about" variant="ghost" size="lg">How submission works</LinkButton>
              </div>
            </div>
          </section>
        </Container>

        <Container>
          <footer className={styles.footer}>
            <div>
              <div className={styles.footer__wordmark}>
                From <em style={{ fontStyle: "italic" }}>the</em> Loop
              </div>
              <div style={{ marginTop: 8, maxWidth: "44ch" }}>
                Interview reports straight from the loop. By candidates, for
                candidates. v0 · pre-launch.
              </div>
            </div>
            <div className={styles.footer__cols}>
              <div className={styles.footer__col}>
                <Link href="/companies">Companies</Link>
                <Link href="/topics">Topics</Link>
                <Link href="/reports">Reports</Link>
              </div>
              <div className={styles.footer__col}>
                <Link href="/submit">Submit</Link>
                <Link href="/about">About</Link>
                <Link href="/styleguide">Design</Link>
              </div>
            </div>
          </footer>
        </Container>
      </main>
    </>
  );
}
