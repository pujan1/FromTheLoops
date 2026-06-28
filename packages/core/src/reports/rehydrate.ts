// Maps a deep report back into the SubmissionDraft shape so "edit" reuses the
// form. Everything resolves to "existing"; editingReportId drives update-in-place.

import type { ReportDetail } from "@fromtheloop/db";
import type { SubmissionDraft, TopicTagSelection } from "@fromtheloop/shared";

export function reportDetailToDraft(detail: ReportDetail): SubmissionDraft {
  return {
    company: { kind: "existing", id: detail.company.id, name: detail.company.name },
    role: { id: detail.role.id, name: detail.role.name },
    level: { id: detail.level.id, name: detail.level.name },
    outcome: detail.outcome ?? null,
    month: detail.interviewMonth,
    attribution: detail.displayAttribution,
    rounds: detail.rounds.map((round) => ({
      roundType: round.roundType,
      rating: round.rating,
      experience: round.experienceProse,
      questions: round.questions.map((question) => ({
        prose: question.prose,
        tags: question.topics.map<TopicTagSelection>((topic) => ({
          kind: "existing",
          id: topic.id,
          slug: topic.slug,
          name: topic.name,
        })),
      })),
    })),
    editingReportId: detail.report.id,
  };
}
