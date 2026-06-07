import { resolveTopic } from "@fromtheloop/core";
import {
  countReportsForTopic,
  getDb,
  listCompaniesForTopic,
  listQuestionsForTopic,
} from "@fromtheloop/db";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/reports";
import { Breadcrumb } from "@/components/breadcrumb";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { QuestionList } from "../_components/question-list";
import styles from "../topics.module.css";

type Params = Promise<{ topic: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { topic } = await params;
  const resolved = await resolveTopic(getDb(), topic);
  if (!resolved) return { title: "Not found — FromTheLoop" };
  return {
    title: `${resolved.topic.name} interview questions — FromTheLoop`,
    description: `Real ${resolved.topic.name} interview questions, aggregated across every company — with the source report behind each one.`,
    alternates: { canonical: routes.topic(resolved.topic.slug) },
  };
}

// /topics/[topic] — a topic aggregated across every company. Position X is the
// question list (question-grain; each card links to its source report); the
// company chips above it drill into /topics/[topic]/[company]. Fully SSR.
export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { topic } = await params;
  const db = getDb();
  const resolved = await resolveTopic(db, topic);
  if (!resolved) notFound();

  const filters = parseReportFilters(await searchParams);
  const basePath = routes.topic(resolved.topic.slug);

  const [reportCount, companies, questionPage] = await Promise.all([
    countReportsForTopic(db, resolved.topic.id),
    listCompaniesForTopic(db, resolved.topic.id),
    listQuestionsForTopic(db, resolved.topic.id, {
      limit: filters.perPage,
      offset: (filters.page - 1) * filters.perPage,
    }),
  ]);

  const startIndex = (filters.page - 1) * filters.perPage;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <Breadcrumb
            items={[
              { label: "Topics", href: routes.topics },
              { label: resolved.topic.name },
            ]}
          />
          <FtlEyebrow tone="accent">topic</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.topic.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {questionPage.total > 0
              ? `${questionPage.total} ${
                  questionPage.total === 1 ? "question" : "questions"
                } across ${reportCount} ${
                  reportCount === 1 ? "report" : "reports"
                } at ${companies.length} ${
                  companies.length === 1 ? "company" : "companies"
                }.`
              : "No questions tagged with this topic yet."}
          </FtlBody>

          {companies.length > 0 && (
            <nav className={styles.companyNav} aria-label="Companies">
              {companies.map((c) => (
                <Link
                  key={c.id}
                  className={styles.companyNav__item}
                  href={routes.topicCompany(resolved.topic.slug, c.slug)}
                >
                  {c.name}
                  <span className={styles.companyNav__count}>
                    {c.reportCount}
                  </span>
                </Link>
              ))}
            </nav>
          )}

          <FtlRule />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Questions</h2>
            <QuestionList items={questionPage.items} />
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
