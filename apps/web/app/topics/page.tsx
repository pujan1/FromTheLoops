import { getDb, listTopicsForIndex, type TopicBrowseRow } from "@fromtheloop/db";
import type { Metadata } from "next";
import Link from "next/link";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import {
  TOPIC_CATEGORY_LABEL,
  TOPIC_CATEGORY_ORDER,
  TOPIC_CATEGORY_OTHER_LABEL,
} from "@/lib/topic-categories";
import styles from "./topics.module.css";

export const metadata: Metadata = {
  title: "Interview topics — FromTheLoop",
  description:
    "Browse interview questions by topic — system design, algorithms, ML, behavioral, and more — aggregated across every company.",
  alternates: { canonical: routes.topics },
};

// One rendered section: a category heading + its topics. `key` is the stable
// category slug (or "other" for the null bucket).
interface Section {
  key: string;
  label: string;
  topics: TopicBrowseRow[];
}

// Group the flat topic list into ordered category sections. Known categories
// render in TOPIC_CATEGORY_ORDER; uncategorized topics (a promoted suggestion a
// mod hasn't grouped) collect into a trailing "Other" section, shown only when
// non-empty.
function groupByCategory(topics: TopicBrowseRow[]): Section[] {
  const byCategory = new Map<string, TopicBrowseRow[]>();
  for (const t of topics) {
    const key = t.category ?? "other";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(t);
    else byCategory.set(key, [t]);
  }

  const sections: Section[] = [];
  for (const category of TOPIC_CATEGORY_ORDER) {
    const rows = byCategory.get(category);
    if (rows && rows.length > 0) {
      sections.push({
        key: category,
        label: TOPIC_CATEGORY_LABEL[category],
        topics: rows,
      });
    }
  }
  const other = byCategory.get("other");
  if (other && other.length > 0) {
    sections.push({
      key: "other",
      label: TOPIC_CATEGORY_OTHER_LABEL,
      topics: other,
    });
  }
  return sections;
}

// /topics — the question-first discovery index. Every curated tag, grouped by
// category, with a count badge of how many reports touch it. SSR off a single
// grouped read (no client fetch).
export default async function TopicsPage() {
  const db = getDb();
  const topics = await listTopicsForIndex(db);
  const sections = groupByCategory(topics);
  const withReports = topics.filter((t) => t.reportCount > 0).length;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <FtlEyebrow tone="accent">topics</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            Browse topics
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {withReports > 0
              ? `Interview questions across ${topics.length} topics — ${withReports} with reports so far.`
              : `${topics.length} curated interview topics. Questions will appear here as reports are published.`}
          </FtlBody>
          <FtlRule />

          <div className={styles.categories}>
            {sections.map((section) => (
              <section key={section.key} className={styles.category}>
                <h2 className={styles.categoryTitle}>{section.label}</h2>
                <div className={styles.chips}>
                  {section.topics.map((t) => (
                    <Link
                      key={t.slug}
                      href={routes.topic(t.slug)}
                      className={
                        t.reportCount > 0
                          ? styles.chip
                          : `${styles.chip} ${styles["chip--empty"]}`
                      }
                    >
                      <span>{t.name}</span>
                      <span className={styles.chip__count}>
                        {t.reportCount}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </FtlContainer>
      </main>
    </>
  );
}
