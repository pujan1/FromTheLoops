import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  Body,
  Container,
  Display,
  Eyebrow,
  Rule,
  SiteHeader,
} from "@/components/ui";
import styles from "./submit.module.css";
import { SubmitForm } from "./submit-form";

// Submission entry point (Sprint 1 Day 5). RSC shell: auth gate + editorial
// header; the interactive fields live in <SubmitForm> (client). Route
// protection is also enforced in middleware — the redirect here is a
// belt-and-suspenders for direct RSC hits.
//
// This sprint the form ends at "Continue → Rounds", which routes to the
// /submit/rounds stub. Draft autosave + resume land Day 6.
export default async function SubmitPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const t = await getTranslations("submit");

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
          <SubmitForm />
        </Container>
      </main>
    </>
  );
}
