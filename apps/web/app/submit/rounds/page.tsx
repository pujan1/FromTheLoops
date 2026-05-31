import { PlaceholderPage } from "../../_components/placeholder-page";

// Sprint 1 ends the submission flow here. Rounds + questions + tag input
// (and the report write itself) land in Sprint 2; the top-level form's
// "Continue → Rounds" CTA resolves to this stub so the flow is walkable.
export default function SubmitRoundsPage() {
  return (
    <PlaceholderPage
      eyebrow="submit · rounds"
      title="Rounds come next."
      body="You’ve captured the basics. Adding individual rounds, questions, and topics is the next step — landing in Sprint 2. Your selections aren’t lost; draft persistence arrives shortly."
      tags={["rounds", "questions", "topics", "coming in sprint 2"]}
    />
  );
}
