import Link from "next/link";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlHeading,
  FtlLinkButton,
  FtlOrnament,
  FtlReportCard,
  FtlSiteHeader,
  FtlTag,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import styles from "./page.module.css";

const topics = [
  { name: "System design", cue: "trade-offs", hint: "scope, data shape, failure modes" },
  { name: "Distributed systems", cue: "deep dives", hint: "consensus, replication, queues" },
  { name: "Behavioral", cue: "stories", hint: "leadership, conflict, judgment" },
  { name: "Take-home", cue: "rubrics", hint: "what they measured after the fact" },
  { name: "ML systems", cue: "production", hint: "training, serving, evaluation" },
  { name: "Frontend depth", cue: "craft", hint: "ui architecture and product judgment" },
  { name: "Coding", cue: "prompts", hint: "live, paired, or async" },
  { name: "Hiring manager", cue: "signals", hint: "what the team actually cared about" },
];

const moments = [
  {
    title: "The shape of the day",
    body: "How many rounds, who showed up, where the energy changed, and what felt different from the recruiter brief.",
  },
  {
    title: "The questions that stuck",
    body: "Not a memorized answer key. Just enough detail to recognize the pattern and prepare your own thinking.",
  },
  {
    title: "The small signals",
    body: "Follow-up speed, interviewer tone, rubric hints, and the places candidates wished they had spent more time.",
  },
];

export default function HomePage() {
  return (
    <>
      <FtlSiteHeader />

      <main className={styles.page}>
        <FtlContainer>
          {/* -------------- Hero -------------- */}
          <section className={styles.hero}>
            <div className={styles.hero__lead}>
              <FtlEyebrow tone="accent">interview experiences</FtlEyebrow>
              <h1 className={styles.hero__headline}>
                What the loop actually felt like.
              </h1>
              <FtlBody size="lead" className={styles.hero__sub}>
                A calmer way to prepare for engineering interviews: read what
                candidates remember from each round, then add your own notes
                when the loop is still fresh.
              </FtlBody>
              <div className={styles.hero__cta}>
                <FtlLinkButton variant="primary" size="lg" href={routes.companies} trailingArrow>Browse companies</FtlLinkButton>
                <FtlLinkButton variant="ghost" size="lg" href={routes.submit}>Share your experience</FtlLinkButton>
              </div>
            </div>

            <aside className={styles.hero__aside}>
              <FtlEyebrow>field note</FtlEyebrow>
              <FtlBody size="small" tone="muted" as="div">
                Not company reviews. Not comp data. Just the loop: what was
                asked, how the room felt, and what would have helped before the
                first call.
              </FtlBody>
              <div className={styles.tagRow}>
                <FtlTag variant="accent" dot>by candidates</FtlTag>
                <FtlTag variant="ghost">for candidates</FtlTag>
                <FtlTag>round by round</FtlTag>
              </div>
            </aside>
          </section>

          {/* -------------- Start here -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>01 / Start here</span>
              <div className={styles.section__head__title}>
                <FtlHeading level={2}>Read the parts candidates usually have to guess.</FtlHeading>
              </div>
              <Link className={styles.section__head__action} href={routes.reports}>browse experiences →</Link>
            </div>
            <div className={styles.moments}>
              {moments.map((moment) => (
                <article className={styles.moment} key={moment.title}>
                  <h3>{moment.title}</h3>
                  <p>{moment.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* -------------- Latest experiences -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>02 / Recent experiences</span>
              <div className={styles.section__head__title}>
                <FtlHeading level={2}>A few loops people wrote down.</FtlHeading>
              </div>
              <Link className={styles.section__head__action} href={routes.reports}>all experiences →</Link>
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
              Most interview prep is either too generic or too polished. The
              useful stuff is messier: what surprised someone, what they
              over-prepared, and what they wish they knew sooner.
            </blockquote>
            <div>
              <FtlEyebrow tone="accent">why this exists</FtlEyebrow>
              <FtlBody style={{ marginTop: 12, maxWidth: "44ch" }}>
                FromTheLoop is for the person with a calendar invite, a vague
                recruiter email, and a weekend to prepare. Every experience
                should make that person feel a little less alone.
              </FtlBody>
              <p className={styles.pull__attr}>the working note</p>
            </div>
          </section>

          {/* -------------- Topics -------------- */}
          <section className={styles.section}>
            <div className={styles.section__head}>
              <span className={styles.section__head__no}>03 / By topic</span>
              <div className={styles.section__head__title}>
                <FtlHeading level={2}>Find the shape of the round you are facing.</FtlHeading>
              </div>
              <Link className={styles.section__head__action} href={routes.topics}>all topics →</Link>
            </div>
            <div className={styles.topics}>
              {topics.map((t) => (
                <a key={t.name} className={styles.topic} href={routes.topic(t.name.toLowerCase().replace(/\s+/g, "-"))}>
                  <span className={styles.topic__count}>{t.cue}</span>
                  <h3 className={styles.topic__name}>{t.name}</h3>
                  <span className={styles.topic__hint}>{t.hint}</span>
                </a>
              ))}
            </div>
          </section>

          <FtlOrnament mark="■" />

          {/* -------------- CTA -------------- */}
          <section className={styles.section} style={{ borderBottom: 0 }}>
            <div className={styles.ctaPanel}>
              <FtlDisplay size="lg" as="h2">
                Took the loop? <em>Write down what helped.</em>
              </FtlDisplay>
              <div className={styles.ctaPanel__actions}>
                <FtlLinkButton href={routes.submit} variant="accent" size="lg" trailingArrow>Share your experience</FtlLinkButton>
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
                Interview experiences, written while the details are still
                useful. v0 · pre-launch.
              </div>
            </div>
            <div className={styles.footer__cols}>
              <div className={styles.footer__col}>
                <Link href={routes.companies}>Companies</Link>
                <Link href={routes.topics}>Topics</Link>
                <Link href={routes.reports}>Experiences</Link>
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
