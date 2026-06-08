import { currentUser } from "@clerk/nextjs/server";
import { getDb, getOrCreateUserByClerkId } from "@fromtheloop/db";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import styles from "./submit.module.css";
import { SubmitForm } from "./submit-form";

// Submission entry point. RSC shell: auth gate + editorial header; the
// interactive fields live in <SubmitForm> (client). Route protection is also
// enforced in middleware — the redirect here is a belt-and-suspenders for
// direct RSC hits.
export default async function SubmitPage() {
  const user = await currentUser();
  if (!user) redirect(routes.signIn);

  const t = await getTranslations("submit");

  // Seed the form's attribution from the user's saved default (settings). The
  // form still lets them flip it per report.
  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">{t("eyebrow")}</FtlEyebrow>
          <FtlDisplay as="h1" size="lg" style={{ marginTop: 24 }}>
            {t.rich("title", { em: (chunks) => <em>{chunks}</em> })}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {t("lede")}
          </FtlBody>
          <FtlRule />
          <SubmitForm defaultAttribution={internal.defaultDisplayAttribution} />
        </FtlContainer>
      </main>
    </>
  );
}
