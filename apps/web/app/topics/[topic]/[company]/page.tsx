import { decideTopicCompanyView, resolveTopicCompany } from "@fromtheloop/core";
import {
  countReportsForTopic,
  getDb,
  listQuestionsForTopic,
} from "@fromtheloop/db";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { Pagination } from "@/components/reports";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { QuestionList } from "../../_components/question-list";
import { TopicSparseBanner } from "../../_components/topic-sparse-banner";
import styles from "../../topics.module.css";

type Params = Promise<{ topic: string; company: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { topic, company } = await params;
  const db = getDb();
  const resolved = await resolveTopicCompany(db, topic, company);
  if (!resolved) return { title: "Not found — FromTheLoop" };

  // A thin cell canonicalizes UP to the topic page, so near-duplicate company
  // leaves don't compete for index space.
  const exactCount = await countReportsForTopic(
    db,
    resolved.topic.id,
    resolved.company.id,
  );
  const { broadened } = decideTopicCompanyView(exactCount);
  const canonical = broadened
    ? routes.topic(resolved.topic.slug)
    : routes.topicCompany(resolved.topic.slug, resolved.company.slug);

  return {
    title: `${resolved.topic.name} interview questions at ${resolved.company.name} — FromTheLoop`,
    description: `${resolved.topic.name} interview questions reported at ${resolved.company.name}, with the source report behind each one.`,
    alternates: { canonical },
  };
}

// /topics/[topic]/[company] — a topic filtered to one company (the second
// discovery axis' programmatic-SEO leaf). Reuses the Sprint 3 sparse-data
// fallback: when this company has too few reports touching the topic, the page
// broadens to the topic across every company (with a banner + up-canonical) so a
// thin cell never reads as a confident sample. Fully SSR.
export default async function TopicCompanyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { topic, company } = await params;
  const db = getDb();
  const resolved = await resolveTopicCompany(db, topic, company);
  if (!resolved) notFound();

  const filters = parseReportFilters(await searchParams);
  const basePath = routes.topicCompany(
    resolved.topic.slug,
    resolved.company.slug,
  );

  // Decide the view off the cell density (distinct reports at the company for
  // the topic) before fetching the question page — the decision picks which
  // corpus to list.
  const [exactCount, topicCount] = await Promise.all([
    countReportsForTopic(db, resolved.topic.id, resolved.company.id),
    countReportsForTopic(db, resolved.topic.id),
  ]);
  const { view, broadened } = decideTopicCompanyView(exactCount);

  const questionPage = await listQuestionsForTopic(db, resolved.topic.id, {
    limit: filters.perPage,
    offset: (filters.page - 1) * filters.perPage,
    // Company view narrows to this company; broadened view spans all companies.
    companyId: view === "company" ? resolved.company.id : undefined,
  });

  const startIndex = (filters.page - 1) * filters.perPage;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <Breadcrumb
            items={[
              { label: "Topics", href: routes.topics },
              { label: resolved.topic.name, href: routes.topic(resolved.topic.slug) },
              { label: resolved.company.name },
            ]}
          />
          <FtlEyebrow tone="accent">topic · company</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.topic.name} at {resolved.company.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {view === "company"
              ? `${exactCount} ${
                  exactCount === 1 ? "report" : "reports"
                } at ${resolved.company.name} touch ${resolved.topic.name}.`
              : `${resolved.topic.name} questions across every company.`}
          </FtlBody>

          {broadened && (
            <TopicSparseBanner
              exactCount={exactCount}
              topicName={resolved.topic.name}
              companyName={resolved.company.name}
              topicCount={topicCount}
              topicHref={routes.topic(resolved.topic.slug)}
            />
          )}

          <FtlRule />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Questions</h2>
            {/* Company view: company is constant (in the header) → drop the chip.
                Broadened view: spans companies → show the chip per card. */}
            <QuestionList
              items={questionPage.items}
              showCompany={view !== "company"}
            />
            {questionPage.total > 0 && (
              <p className={styles.listFoot}>
                Showing {startIndex + 1}–
                {startIndex + questionPage.items.length} of {questionPage.total}
              </p>
            )}
            <Pagination
              basePath={basePath}
              filters={filters}
              total={questionPage.total}
            />
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
