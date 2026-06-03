import { currentUser } from "@clerk/nextjs/server";
import { getDb, getDraft, getOrCreateUserByClerkId } from "@fromtheloop/db";
import { type SubmissionDraft, submissionDraftSchema } from "@fromtheloop/shared";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import {
  Body,
  Container,
  Display,
  Eyebrow,
  Rule,
  SiteHeader,
} from "@/components/ui";
import styles from "../submit.module.css";
import { RoundsForm } from "./rounds-form";

// Sprint 2 Day 2: the rounds screen. Reached from the basics form's
// "Continue → Rounds", which persists the draft and forwards its id as
// ?draft=<id>. Ownership-scoped via getDraft (a guessed/foreign id 404s).
// Without a draft id there's nothing to attach rounds to, so we bounce back
// to the start of the flow.
export default async function SubmitRoundsPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { draft: draftId } = await searchParams;
  if (!draftId) redirect("/submit");

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  const draft = await getDraft(db, draftId, internal.id);
  if (!draft) notFound();

  // Tolerate older/partial draft shapes — fall back to an empty (no-rounds)
  // form rather than crashing the resume.
  const parsed = submissionDraftSchema.safeParse(draft.data);
  const initialData: SubmissionDraft = parsed.success
    ? parsed.data
    : submissionDraftSchema.parse({});

  const t = await getTranslations("rounds");

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <Container width="prose">
          <Eyebrow tone="accent">{t("eyebrow")}</Eyebrow>
          <Display as="h1" size="lg" style={{ marginTop: 24 }}>
            {t.rich("title", { em: (chunks) => <em>{chunks}</em> })}
          </Display>
          <Body size="lead" tone="muted" style={{ marginTop: 16 }}>
            {t("lede")}
          </Body>
          <Rule />
          <RoundsForm draftId={draft.id} initialData={initialData} />
        </Container>
      </main>
    </>
  );
}
