"use client";

// The comments thread orchestrator (ADR-0011). Owns the list, sort, pagination,
// and the shared composer's value/state. On the full report page it's handed an
// SSR first page (eager); on other surfaces (triage pane) it starts collapsed
// and lazy-fetches on expand — so j/k triage nav never pays for comments it
// doesn't open.
//
// The quote/reply TARGET lives one level up (ReportConversation) because a quote
// can originate from a question rendered inside ReportDetailBody, a sibling of
// this section. We receive it as a prop and own only the composer's text/attr.

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { CommentSort, CommentView } from "@fromtheloop/db";
import { FtlBody, FtlButton } from "@/components/ui";
import { createCommentAction, loadCommentsAction } from "./comment-actions";
import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";
import type { CommentTarget } from "./report-conversation";
import styles from "./reports.module.css";

export function CommentsSection({
  reportId,
  signedIn,
  displayName,
  defaultAttribution,
  initialComments,
  initialHasMore,
  initialCount,
  target,
  setTarget,
  collapsed: startCollapsed = false,
}: {
  reportId: string;
  signedIn: boolean;
  displayName: string | null;
  defaultAttribution: "display_name" | "anonymous";
  initialComments: CommentView[];
  initialHasMore: boolean;
  initialCount: number;
  target: CommentTarget;
  setTarget: (t: CommentTarget) => void;
  collapsed?: boolean;
}) {
  const t = useTranslations("report.comments");
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [loadedOnce, setLoadedOnce] = useState(!startCollapsed);
  const [comments, setComments] = useState<CommentView[]>(initialComments);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [count, setCount] = useState(initialCount);
  const [sort, setSort] = useState<CommentSort>("newest");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(
    defaultAttribution === "anonymous" || !displayName,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function fetchPage(nextSort: CommentSort, offset: number): void {
    startTransition(async () => {
      const res = await loadCommentsAction({ reportId, sort: nextSort, offset });
      setComments((prev) => (offset === 0 ? res.comments : [...prev, ...res.comments]));
      setHasMore(res.hasMore);
      setLoadedOnce(true);
    });
  }

  function expand(): void {
    setCollapsed(false);
    if (!loadedOnce) fetchPage(sort, 0);
  }

  function changeSort(next: CommentSort): void {
    if (next === sort) return;
    setSort(next);
    fetchPage(next, 0);
  }

  // Re-pull the first page from the server (after create/edit/delete) so the
  // list reflects authoritative state without hand-patching every row.
  function refresh(): void {
    fetchPage(sort, 0);
  }

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const res = await createCommentAction({
        reportId,
        body,
        displayAttribution: anonymous || !displayName ? "anonymous" : "display_name",
        quotedQuestionId: target?.kind === "question" ? target.questionId : null,
        replyToCommentId: target?.kind === "comment" ? target.commentId : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      setTarget(null);
      setCount((c) => c + 1);
      // New comment is newest — show it by snapping to newest + reloading.
      setSort("newest");
      const fresh = await loadCommentsAction({ reportId, sort: "newest", offset: 0 });
      setComments(fresh.comments);
      setHasMore(fresh.hasMore);
    });
  }

  if (collapsed) {
    return (
      <section className={styles.commentsCollapsed}>
        <button
          type="button"
          className={styles.commentsCollapsed__btn}
          onClick={expand}
        >
          💬 {t("count", { count })}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.comments}>
      <div className={styles.comments__head}>
        <h2 className={styles.comments__heading}>{t("count", { count })}</h2>
        {comments.length > 1 && (
          <div className={styles.comments__sort} role="tablist">
            <button
              type="button"
              data-on={sort === "newest"}
              onClick={() => changeSort("newest")}
            >
              {t("sortNewest")}
            </button>
            <button
              type="button"
              data-on={sort === "top"}
              onClick={() => changeSort("top")}
            >
              {t("sortTop")}
            </button>
          </div>
        )}
      </div>

      <CommentComposer
        target={target}
        onClearTarget={() => setTarget(null)}
        signedIn={signedIn}
        displayName={displayName}
        anonymous={anonymous}
        onToggleAnonymous={setAnonymous}
        value={body}
        onChange={setBody}
        onSubmit={submit}
        pending={pending}
        error={error}
      />

      {comments.length === 0 ? (
        <FtlBody tone="muted" className={styles.comments__empty}>
          {t("empty")}
        </FtlBody>
      ) : (
        <ul className={styles.comments__list}>
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              reportId={reportId}
              signedIn={signedIn}
              onReply={setTarget}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className={styles.comments__more}>
          <FtlButton
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => fetchPage(sort, comments.length)}
          >
            {t("loadMore")}
          </FtlButton>
        </div>
      )}
    </section>
  );
}
