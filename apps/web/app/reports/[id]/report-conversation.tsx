"use client";

// Client wrapper that turns the read-only report body into a conversation
// (ADR-0011). It owns the quote/reply TARGET because a quote can come from a
// question rendered inside <ReportDetailBody> (here, via renderQuestionAffordance)
// or from a comment inside <CommentsSection> — both feed the one shared composer.
//
// Composition (top → bottom): the report tree, the post engagement row
// (like · share), the verified Helpful flag, then the comments thread. The
// server page passes only serializable data; all interactivity lives here.

import type { CommentView, ReportDetailView } from "@fromtheloop/db";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CommentsSection } from "./comments-section";
import { HelpfulFlagButton } from "./helpful-flag-button";
import { PostEngagement } from "./post-engagement";
import { ReportDetailBody } from "./report-detail-body";
import styles from "./reports.module.css";

// The thing a new comment quotes: one question, one comment, or nothing.
export type CommentTarget =
  | { kind: "question"; questionId: string; text: string }
  | { kind: "comment"; commentId: string; text: string; authorLabel: string | null }
  | null;

export interface ConversationEngagement {
  postLike: { liked: boolean; count: number };
  helpful: {
    count: number;
    flagged: boolean;
    canFlag: boolean;
    reason?: "signIn" | "verify" | "author";
  } | null;
  comments: { initial: CommentView[]; hasMore: boolean; count: number };
  commenter: {
    displayName: string | null;
    defaultAttribution: "display_name" | "anonymous";
  };
}

export function ReportConversation({
  detail,
  eyebrow,
  byline,
  reportId,
  signedIn,
  engagement,
  collapsedComments = false,
}: {
  detail: ReportDetailView;
  eyebrow: string;
  byline: ReactNode;
  reportId: string;
  signedIn: boolean;
  engagement: ConversationEngagement;
  collapsedComments?: boolean;
}) {
  const t = useTranslations("report.comments");
  const [target, setTarget] = useState<CommentTarget>(null);

  return (
    <>
      <ReportDetailBody
        detail={detail}
        eyebrow={eyebrow}
        byline={byline}
        renderQuestionAffordance={(questionId, prose) => (
          <button
            type="button"
            className={styles.question__reply}
            onClick={() => setTarget({ kind: "question", questionId, text: prose })}
          >
            {t("quoteThis")}
          </button>
        )}
      />

      <PostEngagement
        reportId={reportId}
        signedIn={signedIn}
        initialLiked={engagement.postLike.liked}
        initialLikeCount={engagement.postLike.count}
      />

      {engagement.helpful && (
        <HelpfulFlagButton
          reportId={reportId}
          initialFlagged={engagement.helpful.flagged}
          initialCount={engagement.helpful.count}
          canFlag={engagement.helpful.canFlag}
          reason={engagement.helpful.reason}
        />
      )}

      <CommentsSection
        reportId={reportId}
        signedIn={signedIn}
        displayName={engagement.commenter.displayName}
        defaultAttribution={engagement.commenter.defaultAttribution}
        initialComments={engagement.comments.initial}
        initialHasMore={engagement.comments.hasMore}
        initialCount={engagement.comments.count}
        target={target}
        setTarget={setTarget}
        collapsed={collapsedComments}
      />
    </>
  );
}
