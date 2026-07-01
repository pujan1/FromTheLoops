import { PlaceholderPage } from "../_components/placeholder-page";

export default function FaqPage() {
  return (
    <PlaceholderPage
      eyebrow="faq"
      title="Questions, answered."
      body="This page will answer the common questions: how anonymity works, what happens to your data, how moderation and Recruiter-Confirmed verification work, and how to get content removed."
      tags={["anonymity", "data", "verification"]}
    />
  );
}
