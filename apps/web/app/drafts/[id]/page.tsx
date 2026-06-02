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
import styles from "../../submit/submit.module.css";
import { SubmitForm } from "../../submit/submit-form";

// Resume an in-progress submission (Sprint 1 Day 6). Ownership-scoped:
// getDraft only returns the row if it belongs to the signed-in user, so a
// guessed/shared draft id 404s rather than leaking another user's draft.
export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  const draft = await getDraft(db, id, internal.id);
  if (!draft) notFound();

  // Tolerate older/partial draft shapes — a parse failure falls back to an
  // empty form rather than crashing the resume.
  const parsed = submissionDraftSchema.safeParse(draft.data);
  const initialData: SubmissionDraft | null = parsed.success
    ? parsed.data
    : null;

  const t = await getTranslations("drafts");

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
          <SubmitForm initialDraftId={draft.id} initialData={initialData} />
        </Container>
      </main>
    </>
  );
}
