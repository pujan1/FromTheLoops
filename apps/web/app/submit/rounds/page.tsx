import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "../../_components/placeholder-page";

// Sprint 1 ends the submission flow here. Rounds + questions + tag input
// (and the report write itself) land in Sprint 2; the top-level form's
// "Continue → Rounds" CTA resolves to this stub so the flow is walkable.
export default async function SubmitRoundsPage() {
  const t = await getTranslations("rounds");
  return (
    <PlaceholderPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      body={t("body")}
      tags={[t("tagRounds"), t("tagQuestions"), t("tagTopics"), t("tagSoon")]}
    />
  );
}
