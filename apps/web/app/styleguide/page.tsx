import {
  FtlBody,
  FtlButton,
  FtlCaption,
  FtlCard,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlHeading,
  FtlLinkButton,
  FtlMono,
  FtlNotice,
  FtlOrnament,
  FtlReportCard,
  FtlRule,
  FtlSiteHeader,
  FtlStat,
  FtlStatGroup,
  FtlStatusBadge,
  FtlTag,
} from "@/components/ui";
import { ComboboxDemo } from "./_combobox-demo";
import { DismissibleNoticeDemo } from "./_notice-demo";
import styles from "./page.module.css";

const colors = [
  "paper",
  "paper-2",
  "paper-3",
  "ink",
  "ink-2",
  "muted",
  "muted-2",
  "rule",
  "rule-strong",
  "accent",
  "accent-deep",
  "accent-soft",
  "success",
  "warning",
  "danger",
  "pending",
  "info",
];

export default function StyleguidePage() {
  return (
    <>
      <FtlSiteHeader issue="DESIGN SYSTEM · v0.1" />

      <main className={styles.page}>
        <FtlContainer>
          {/* ----------------------- Lede ----------------------- */}
          <div className={styles.lede}>
            <div>
              <FtlEyebrow tone="accent">Design system</FtlEyebrow>
              <FtlDisplay as="h1" size="2xl" style={{ marginTop: 24 }}>
                The <em>field guide</em> to FromTheLoop.
              </FtlDisplay>
            </div>
            <div className={styles.lede__meta}>
              <FtlBody size="lead">
                Tokens, type, and components. Editorial restraint over generic
                polish. Built so every surface — wedge page, submission flow,
                profile — feels like part of the same publication.
              </FtlBody>
              <FtlBody tone="muted" style={{ marginTop: 12, maxWidth: "56ch" }}>
                Every primitive ships from <FtlMono>@/components/ui</FtlMono> with
                an <FtlMono>Ftl</FtlMono> prefix — <FtlMono>FtlButton</FtlMono>,{" "}
                <FtlMono>FtlInput</FtlMono>, <FtlMono>FtlField</FtlMono> — so
                library components are unmistakable from app code in JSX.
              </FtlBody>
              <dl>
                <dt>Version</dt><dd>0.1 · pre-build</dd>
                <dt>Surface</dt><dd>Light + dark · paper and pressroom</dd>
                <dt>Stack</dt><dd>Next.js 15 · CSS Modules · next/font</dd>
                <dt>Components</dt><dd><FtlMono>Ftl</FtlMono>-prefixed · <FtlMono>@/components/ui</FtlMono></dd>
                <dt>Updated</dt><dd>2026-06-02</dd>
              </dl>
            </div>
          </div>

          {/* ----------------------- Color ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 01 — Color</div>
              <div>
                <FtlHeading level={2}>Warm paper by day, pressroom ink by night.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  The palette commits to warm neutrals, a dense night mode, and
                  one confident accent that survives both surfaces.
                </FtlBody>
              </div>
            </header>
            <div className={styles.swatches}>
              {colors.map((name) => (
                <div key={name} className={styles.swatch}>
                  <div className={styles.swatch__chip} style={{ background: `var(--color-${name})` }} />
                  <div className={styles.swatch__body}>
                    <span className={styles.swatch__name}>--color-{name}</span>
                    <span className={styles.swatch__hex}>active theme token</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ----------------------- Type ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 02 — Typography</div>
              <div>
                <FtlHeading level={2}>DM Sans × Geist × Geist Mono.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  A geometric sans for display, a refined grotesque for UI, a
                  precise mono for metadata. Italics in the accent tone are
                  reserved for editorial emphasis.
                </FtlBody>
              </div>
            </header>

            <div className={styles.fonts}>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Display · 2xl</span>
                <FtlDisplay size="2xl">From the <em>loop</em>.</FtlDisplay>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Display · xl</span>
                <FtlDisplay size="xl">Interview reports, by candidates.</FtlDisplay>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Display · lg</span>
                <FtlDisplay size="lg">A two-week loop, in four acts.</FtlDisplay>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Heading 1 · sans</span>
                <FtlHeading level={1}>Stripe · Staff SWE · L5</FtlHeading>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Heading 2 · sans</span>
                <FtlHeading level={2}>What the recruiter actually screened for</FtlHeading>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Heading 3 · sans</span>
                <FtlHeading level={3}>Round 3 — system design</FtlHeading>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Body lead</span>
                <FtlBody size="lead">
                  Find the right interview report for what you are interviewing
                  for — by company, role, level, round-type, and topic.
                </FtlBody>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Body</span>
                <FtlBody>
                  The recruiter screen lasted thirty-five minutes. Two
                  resume-walk questions, one current-project deep-dive, and a
                  forty-five-second pitch on why <FtlMono>distributed payments</FtlMono>.
                  No code. The signal felt low; the stakes felt high.
                </FtlBody>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Caption · mono</span>
                <FtlCaption>posted 2 days ago · verified work-email · 47 helpful votes</FtlCaption>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Eyebrow · mono</span>
                <div className={styles.row}>
                  <FtlEyebrow>aggregate</FtlEyebrow>
                  <FtlEyebrow tone="accent">live · 12 reports</FtlEyebrow>
                  <FtlEyebrow tone="ink" bare>SS · L5</FtlEyebrow>
                </div>
              </div>
            </div>
          </section>

          {/* ----------------------- Rules & ornaments ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 03 — Rules</div>
              <div>
                <FtlHeading level={2}>Hairlines, not shadows.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Editorial layouts use rules to separate, not cards. Five
                  variants cover everything we need.
                </FtlBody>
              </div>
            </header>
            <div className={styles.stack}>
              <div><FtlCaption>default</FtlCaption><FtlRule /></div>
              <div><FtlCaption>strong</FtlCaption><FtlRule variant="strong" /></div>
              <div><FtlCaption>ink</FtlCaption><FtlRule variant="ink" /></div>
              <div><FtlCaption>dashed</FtlCaption><FtlRule variant="dashed" /></div>
              <div><FtlCaption>dotted</FtlCaption><FtlRule variant="dotted" /></div>
              <div style={{ marginTop: 16 }}>
                <FtlCaption>ornament — section break</FtlCaption>
                <FtlOrnament mark="§" />
              </div>
            </div>
          </section>

          {/* ----------------------- Tags ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 04 — Tags</div>
              <div>
                <FtlHeading level={2}>Mono tags for taxonomy.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Tags carry topic, level, and trust signals. Mono case gives
                  them an engineering report quality.
                </FtlBody>
              </div>
            </header>
            <div className={styles.row}>
              <FtlTag>system-design</FtlTag>
              <FtlTag variant="ghost">behavioral</FtlTag>
              <FtlTag variant="accent" dot>verified</FtlTag>
              <FtlTag variant="ink">L5</FtlTag>
              <FtlTag>onsite · 5 rounds</FtlTag>
              <FtlTag variant="ghost">distributed-systems</FtlTag>
              <FtlTag variant="accent">new</FtlTag>
            </div>
          </section>

          {/* ----------------------- Buttons ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 05 — Buttons</div>
              <div>
                <FtlHeading level={2}>Four variants, three sizes.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Primary is ink, accent is peacock, ghost is hairline, link is
                  underline. Borrowed from print press logic.
                </FtlBody>
              </div>
            </header>
            <div className={styles.stack}>
              <div className={styles.row}>
                <FtlButton variant="primary" trailingArrow>Submit a report</FtlButton>
                <FtlButton variant="accent" trailingArrow>Read latest</FtlButton>
                <FtlButton variant="ghost">Browse companies</FtlButton>
                <FtlLinkButton variant="link" href="#">Learn more</FtlLinkButton>
              </div>
              <div className={styles.row}>
                <FtlButton size="sm">small</FtlButton>
                <FtlButton size="md">medium</FtlButton>
                <FtlButton size="lg" trailingArrow>large</FtlButton>
              </div>
              <div className={styles.row}>
                <FtlButton variant="primary" disabled>disabled</FtlButton>
              </div>
            </div>
          </section>

          {/* ----------------------- Combobox ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 5b — Combobox</div>
              <div>
                <FtlHeading level={2}>Autocomplete with a suggest-new escape hatch.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Debounced async lookup, full keyboard nav (↑/↓, Enter, Esc),
                  and an optional &ldquo;suggest new&rdquo; row. Companies allow
                  it; canonical roles are a closed set and do not.
                </FtlBody>
              </div>
            </header>
            <ComboboxDemo />
          </section>

          {/* ----------------------- Cards ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 06 — Cards</div>
              <div>
                <FtlHeading level={2}>Cards as composition, not container.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Three variants cover the surface area. Default uses only a
                  top rule. No drop shadows.
                </FtlBody>
              </div>
            </header>
            <div className={styles["grid-3"]}>
              <FtlCard variant="default" interactive showArrow>
                <FtlEyebrow tone="accent">aggregate</FtlEyebrow>
                <FtlHeading level={3}>Stripe · Staff SWE · L5</FtlHeading>
                <FtlCaption>12 reports · 47 rounds · last updated 2 days ago</FtlCaption>
              </FtlCard>
              <FtlCard variant="bordered">
                <FtlEyebrow>method</FtlEyebrow>
                <FtlHeading level={3}>How we score reports</FtlHeading>
                <FtlBody size="small">
                  Confidence × recency × trust signals. Work-email verified
                  contributors weight higher.
                </FtlBody>
              </FtlCard>
              <FtlCard variant="filled">
                <FtlEyebrow tone="ink">callout</FtlEyebrow>
                <FtlHeading level={3}>You took the loop. Now write it down.</FtlHeading>
                <FtlLinkButton variant="link" href="#">Submit a report</FtlLinkButton>
              </FtlCard>
            </div>
          </section>

          {/* ----------------------- Stats ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 07 — Stats</div>
              <div>
                <FtlHeading level={2}>Numbers as typographic features.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Stats use the display sans. Numerals set in 2.5rem
                  DM Sans punch above their weight on aggregation pages.
                </FtlBody>
              </div>
            </header>
            <FtlStatGroup>
              <FtlStat label="reports" value="412" hint="across 38 companies" />
              <FtlStat label="rounds" value="1,847" hint="recruiter → onsite" />
              <FtlStat label="verified" value="68%" accent hint="work-email + LinkedIn" />
              <FtlStat label="topics" value="124" hint="curated taxonomy" />
            </FtlStatGroup>
          </section>

          {/* ----------------------- Report card ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 08 — Report card</div>
              <div>
                <FtlHeading level={2}>The product unit.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Every aggregation, search result, and profile is a list of
                  these. The headline is editorial, not a label.
                </FtlBody>
              </div>
            </header>
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
              <FtlRule />
            </div>
          </section>

          {/* ----------------------- Status & feedback ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 09 — Status &amp; feedback</div>
              <div>
                <FtlHeading level={2}>The boring, crucial states.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Every flow needs to say what just happened. Badges report a
                  unit&rsquo;s state; notices report a flow&rsquo;s outcome. Both
                  key on the severity tokens, so the meaning travels with the
                  color.
                </FtlBody>
              </div>
            </header>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
              <FtlStatusBadge status="success">verified</FtlStatusBadge>
              <FtlStatusBadge status="pending">in review</FtlStatusBadge>
              <FtlStatusBadge status="warning">rate limited</FtlStatusBadge>
              <FtlStatusBadge status="danger">rejected</FtlStatusBadge>
              <FtlStatusBadge status="info">draft</FtlStatusBadge>
              <FtlStatusBadge status="neutral">archived</FtlStatusBadge>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FtlNotice tone="success" title="Report submitted.">
                Your interview report is in the moderation queue. We&rsquo;ll email
                you when it&rsquo;s published — usually within a day.
              </FtlNotice>
              <FtlNotice tone="danger" title="Couldn&rsquo;t save your draft.">
                Three fields still need attention before you can continue. Check
                the company, level, and month above.
              </FtlNotice>
              <FtlNotice tone="warning" title="You&rsquo;re going a little fast.">
                You&rsquo;ve hit the suggestion limit for now. Try again in an
                hour — this keeps the moderation queue clean.
              </FtlNotice>
              <DismissibleNoticeDemo />
            </div>
          </section>

          {/* ----------------------- Spec ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 10 — Tokens</div>
              <div>
                <FtlHeading level={2}>Authoritative reference.</FtlHeading>
                <FtlBody tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  All tokens are CSS custom properties on <FtlMono>:root</FtlMono>.
                  Components consume them via <FtlMono>var(--*)</FtlMono> only.
                </FtlBody>
              </div>
            </header>
            <pre className={styles.specBlock}>{`--color-paper        light: #FAF7F2 · dark: #11100E
--color-ink          light: #18171A · dark: #F4EFE4
--color-accent       light: #167C8C · dark: #36B6BD
--font-display       DM Sans
--font-sans          Geist
--font-mono          Geist Mono
--space scale        4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 144
--radius             0 · 2 · 4 · 8 · 999
--container-max      1240
--container-prose    680
--theme-storage      fromtheloop-theme`}</pre>
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
