import {
  Body,
  Button,
  Caption,
  Card,
  Container,
  Display,
  Eyebrow,
  Heading,
  LinkButton,
  Mono,
  Ornament,
  ReportCard,
  Rule,
  SiteHeader,
  Stat,
  StatGroup,
  Tag,
} from "@/components/ui";
import { ComboboxDemo } from "./_combobox-demo";
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
];

export default function StyleguidePage() {
  return (
    <>
      <SiteHeader issue="DESIGN SYSTEM · v0.1" />

      <main className={styles.page}>
        <Container>
          {/* ----------------------- Lede ----------------------- */}
          <div className={styles.lede}>
            <div>
              <Eyebrow tone="accent">Design system</Eyebrow>
              <Display as="h1" size="2xl" style={{ marginTop: 24 }}>
                The <em>field guide</em> to FromTheLoop.
              </Display>
            </div>
            <div className={styles.lede__meta}>
              <Body size="lead">
                Tokens, type, and components. Editorial restraint over generic
                polish. Built so every surface — wedge page, submission flow,
                profile — feels like part of the same publication.
              </Body>
              <dl>
                <dt>Version</dt><dd>0.1 · pre-build</dd>
                <dt>Surface</dt><dd>Light + dark · paper and pressroom</dd>
                <dt>Stack</dt><dd>Next.js 15 · CSS Modules · next/font</dd>
                <dt>Updated</dt><dd>2026-05-23</dd>
              </dl>
            </div>
          </div>

          {/* ----------------------- Color ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 01 — Color</div>
              <div>
                <Heading level={2}>Warm paper by day, pressroom ink by night.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  The palette commits to warm neutrals, a dense night mode, and
                  one confident accent that survives both surfaces.
                </Body>
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
                <Heading level={2}>DM Sans × Geist × Geist Mono.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  A geometric sans for display, a refined grotesque for UI, a
                  precise mono for metadata. Italics in the accent tone are
                  reserved for editorial emphasis.
                </Body>
              </div>
            </header>

            <div className={styles.fonts}>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Display · 2xl</span>
                <Display size="2xl">From the <em>loop</em>.</Display>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Display · xl</span>
                <Display size="xl">Interview reports, by candidates.</Display>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Display · lg</span>
                <Display size="lg">A two-week loop, in four acts.</Display>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Heading 1 · sans</span>
                <Heading level={1}>Stripe · Staff SWE · L5</Heading>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Heading 2 · sans</span>
                <Heading level={2}>What the recruiter actually screened for</Heading>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Heading 3 · sans</span>
                <Heading level={3}>Round 3 — system design</Heading>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Body lead</span>
                <Body size="lead">
                  Find the right interview report for what you are interviewing
                  for — by company, role, level, round-type, and topic.
                </Body>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Body</span>
                <Body>
                  The recruiter screen lasted thirty-five minutes. Two
                  resume-walk questions, one current-project deep-dive, and a
                  forty-five-second pitch on why <Mono>distributed payments</Mono>.
                  No code. The signal felt low; the stakes felt high.
                </Body>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Caption · mono</span>
                <Caption>posted 2 days ago · verified work-email · 47 helpful votes</Caption>
              </div>
              <div className={styles.fonts__sample}>
                <span className={styles.fonts__label}>Eyebrow · mono</span>
                <div className={styles.row}>
                  <Eyebrow>aggregate</Eyebrow>
                  <Eyebrow tone="accent">live · 12 reports</Eyebrow>
                  <Eyebrow tone="ink" bare>SS · L5</Eyebrow>
                </div>
              </div>
            </div>
          </section>

          {/* ----------------------- Rules & ornaments ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 03 — Rules</div>
              <div>
                <Heading level={2}>Hairlines, not shadows.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Editorial layouts use rules to separate, not cards. Five
                  variants cover everything we need.
                </Body>
              </div>
            </header>
            <div className={styles.stack}>
              <div><Caption>default</Caption><Rule /></div>
              <div><Caption>strong</Caption><Rule variant="strong" /></div>
              <div><Caption>ink</Caption><Rule variant="ink" /></div>
              <div><Caption>dashed</Caption><Rule variant="dashed" /></div>
              <div><Caption>dotted</Caption><Rule variant="dotted" /></div>
              <div style={{ marginTop: 16 }}>
                <Caption>ornament — section break</Caption>
                <Ornament mark="§" />
              </div>
            </div>
          </section>

          {/* ----------------------- Tags ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 04 — Tags</div>
              <div>
                <Heading level={2}>Mono tags for taxonomy.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Tags carry topic, level, and trust signals. Mono case gives
                  them an engineering report quality.
                </Body>
              </div>
            </header>
            <div className={styles.row}>
              <Tag>system-design</Tag>
              <Tag variant="ghost">behavioral</Tag>
              <Tag variant="accent" dot>verified</Tag>
              <Tag variant="ink">L5</Tag>
              <Tag>onsite · 5 rounds</Tag>
              <Tag variant="ghost">distributed-systems</Tag>
              <Tag variant="accent">new</Tag>
            </div>
          </section>

          {/* ----------------------- Buttons ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 05 — Buttons</div>
              <div>
                <Heading level={2}>Four variants, three sizes.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Primary is ink, accent is peacock, ghost is hairline, link is
                  underline. Borrowed from print press logic.
                </Body>
              </div>
            </header>
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button variant="primary" trailingArrow>Submit a report</Button>
                <Button variant="accent" trailingArrow>Read latest</Button>
                <Button variant="ghost">Browse companies</Button>
                <LinkButton variant="link" href="#">Learn more</LinkButton>
              </div>
              <div className={styles.row}>
                <Button size="sm">small</Button>
                <Button size="md">medium</Button>
                <Button size="lg" trailingArrow>large</Button>
              </div>
              <div className={styles.row}>
                <Button variant="primary" disabled>disabled</Button>
              </div>
            </div>
          </section>

          {/* ----------------------- Combobox ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 5b — Combobox</div>
              <div>
                <Heading level={2}>Autocomplete with a suggest-new escape hatch.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Debounced async lookup, full keyboard nav (↑/↓, Enter, Esc),
                  and an optional &ldquo;suggest new&rdquo; row. Companies allow
                  it; canonical roles are a closed set and do not.
                </Body>
              </div>
            </header>
            <ComboboxDemo />
          </section>

          {/* ----------------------- Cards ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 06 — Cards</div>
              <div>
                <Heading level={2}>Cards as composition, not container.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Three variants cover the surface area. Default uses only a
                  top rule. No drop shadows.
                </Body>
              </div>
            </header>
            <div className={styles["grid-3"]}>
              <Card variant="default" interactive showArrow>
                <Eyebrow tone="accent">aggregate</Eyebrow>
                <Heading level={3}>Stripe · Staff SWE · L5</Heading>
                <Caption>12 reports · 47 rounds · last updated 2 days ago</Caption>
              </Card>
              <Card variant="bordered">
                <Eyebrow>method</Eyebrow>
                <Heading level={3}>How we score reports</Heading>
                <Body size="small">
                  Confidence × recency × trust signals. Work-email verified
                  contributors weight higher.
                </Body>
              </Card>
              <Card variant="filled">
                <Eyebrow tone="ink">callout</Eyebrow>
                <Heading level={3}>You took the loop. Now write it down.</Heading>
                <LinkButton variant="link" href="#">Submit a report</LinkButton>
              </Card>
            </div>
          </section>

          {/* ----------------------- Stats ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 07 — Stats</div>
              <div>
                <Heading level={2}>Numbers as typographic features.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Stats use the display sans. Numerals set in 2.5rem
                  DM Sans punch above their weight on aggregation pages.
                </Body>
              </div>
            </header>
            <StatGroup>
              <Stat label="reports" value="412" hint="across 38 companies" />
              <Stat label="rounds" value="1,847" hint="recruiter → onsite" />
              <Stat label="verified" value="68%" accent hint="work-email + LinkedIn" />
              <Stat label="topics" value="124" hint="curated taxonomy" />
            </StatGroup>
          </section>

          {/* ----------------------- Report card ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 08 — Report card</div>
              <div>
                <Heading level={2}>The product unit.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  Every aggregation, search result, and profile is a list of
                  these. The headline is editorial, not a label.
                </Body>
              </div>
            </header>
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
              <Rule />
            </div>
          </section>

          {/* ----------------------- Spec ----------------------- */}
          <section className={styles.section}>
            <header className={styles.section__head}>
              <div className={styles.section__head__no}>§ 09 — Tokens</div>
              <div>
                <Heading level={2}>Authoritative reference.</Heading>
                <Body tone="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
                  All tokens are CSS custom properties on <Mono>:root</Mono>.
                  Components consume them via <Mono>var(--*)</Mono> only.
                </Body>
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
        </Container>
      </main>
    </>
  );
}
