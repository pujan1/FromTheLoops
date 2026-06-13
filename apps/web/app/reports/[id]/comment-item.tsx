"use client";

// One comment in the flat thread (ADR-0011). Renders its optional quote/reply
// preview (collapsed one-liner, click to expand), the body (or a placeholder
// when deleted/hidden), the like toggle (optimistic), and the owner's inline
// edit / delete. Reply routes a target up to the shared composer via onReply.

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { CommentView } from "@fromtheloop/db";
import { FtlButton, FtlTextarea } from "@/components/ui";
import { routes } from "@/lib/routes";
import {
  deleteCommentAction,
  editCommentAction,
  toggleCommentLikeAction,
} from "./comment-actions";
import type { CommentTarget } from "./report-conversation";
import styles from "./reports.module.css";

export function CommentItem({
  comment,
  reportId,
  signedIn,
  onReply,
  onChanged,
}: {
  comment: CommentView;
  reportId: string;
  signedIn: boolean;
  onReply: (target: CommentTarget) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("report.comments");
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body ?? "");
  const [liked, setLiked] = useState(comment.viewerLiked);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [pending, startTransition] = useTransition();

  const isActive = comment.status === "active";
  const authorLabel = comment.authorLabel ?? t("anonymous");

  function toggleLike(): void {
    if (!signedIn || pending) return;
    // Optimistic; reconcile with the server's authoritative count.
    setLiked((v) => !v);
    setLikeCount((c) => c + (liked ? -1 : 1));
    startTransition(async () => {
      const res = await toggleCommentLikeAction(comment.id);
      setLiked(res.liked);
      setLikeCount(res.count);
    });
  }

  function saveEdit(): void {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await editCommentAction({ reportId, commentId: comment.id, body });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    });
  }

  function remove(): void {
    if (!window.confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      const res = await deleteCommentAction({ reportId, commentId: comment.id });
      if (res.ok) onChanged();
    });
  }

  return (
    <li className={styles.comment} id={`c-${comment.id}`}>
      {/* Quote of a question, or a reply preview of another comment. */}
      {comment.quotedText && (
        <button
          type="button"
          className={styles.comment__quote}
          data-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className={styles.comment__quoteIcon} aria-hidden="true">
            ❝
          </span>
          <span className={styles.comment__quoteText}>{comment.quotedText}</span>
        </button>
      )}
      {comment.replyTo && (
        <div className={styles.comment__replyTo}>
          <span className={styles.comment__quoteIcon} aria-hidden="true">
            ↩
          </span>
          <span className={styles.comment__replyToName}>
            {comment.replyTo.authorLabel ?? t("anonymous")}
          </span>
          <span className={styles.comment__quoteText}>
            {comment.replyTo.status === "active"
              ? comment.replyTo.snippet
              : t("replyTargetGone")}
          </span>
        </div>
      )}

      <div className={styles.comment__head}>
        <span className={styles.comment__author}>{authorLabel}</span>
        <span className={styles.comment__time}>
          {new Date(comment.createdAt).toLocaleDateString()}
          {comment.editedAt && ` · ${t("edited")}`}
        </span>
      </div>

      {editing ? (
        <div className={styles.comment__edit}>
          <FtlTextarea
            value={draft}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className={styles.comment__editActions}>
            <FtlButton size="sm" variant="primary" onClick={saveEdit} disabled={pending}>
              {t("save")}
            </FtlButton>
            <FtlButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(comment.body ?? "");
              }}
            >
              {t("cancel")}
            </FtlButton>
          </div>
        </div>
      ) : (
        <p className={styles.comment__body} data-muted={!isActive}>
          {isActive
            ? comment.body
            : comment.status === "deleted"
              ? t("deletedPlaceholder")
              : t("removedPlaceholder")}
        </p>
      )}

      {/* Actions: only on a live comment, not when editing. */}
      {isActive && !editing && (
        <div className={styles.comment__actions}>
          {signedIn ? (
            <button
              type="button"
              className={styles.comment__like}
              data-on={liked}
              onClick={toggleLike}
              disabled={pending}
              aria-pressed={liked}
            >
              ♥ {likeCount > 0 ? likeCount : ""} {liked ? t("liked") : t("like")}
            </button>
          ) : (
            <a href={routes.signIn} className={styles.comment__like}>
              ♥ {likeCount > 0 ? likeCount : ""}
            </a>
          )}

          <button
            type="button"
            className={styles.comment__action}
            onClick={() =>
              onReply({
                kind: "comment",
                commentId: comment.id,
                text: comment.body ?? "",
                authorLabel: comment.authorLabel,
              })
            }
          >
            {t("reply")}
          </button>

          {comment.viewerIsAuthor && (
            <>
              <button
                type="button"
                className={styles.comment__action}
                onClick={() => {
                  setDraft(comment.body ?? "");
                  setEditing(true);
                }}
              >
                {t("edit")}
              </button>
              <button
                type="button"
                className={styles.comment__action}
                data-danger="true"
                onClick={remove}
                disabled={pending}
              >
                {t("delete")}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
