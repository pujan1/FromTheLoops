import { PlaceholderPage } from "../_components/placeholder-page";

export default function TopicsPage() {
  return (
    <PlaceholderPage
      eyebrow="topics"
      title="Topic taxonomy is wired in."
      body="This page will collect system design, behavioral, coding, and role-specific report topics into browsable groups."
      tags={["system-design", "behavioral", "frontend", "ml-systems"]}
    />
  );
}
