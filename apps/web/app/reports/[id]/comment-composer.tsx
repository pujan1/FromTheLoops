"use client";

// The single shared comment composer (ADR-0011). One per thread; the inline
// "Reply" affordances on questions and comments focus it with a quote chip
// attached (target). Plain text only, anon-by-default with a per-comment name
// toggle. Signed-out readers see a sign-in nudge instead.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { FtlBody, FtlButton, FtlLinkButton, FtlTextarea } from "@/components/ui";
import { routes } from "@/lib/routes";
import type { CommentTarget, QuotableQuestion } from "./report-conversation";
import { COMMENT_MAX_LENGTH } from "./comments-config";
import styles from "./reports.module.css";

// Trim a question's prose to a single readable <option> line.
const QUOTE_OPTION_MAX = 80;
const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export function CommentComposer({
  target,
  onClearTarget,
  quotableQuestions,
  onQuoteQuestion,
  signedIn,
  displayName,
  anonymous,
  onToggleAnonymous,
  value,
  onChange,
  onSubmit,
  pending,
  error,
}: {
  target: CommentTarget;
  onClearTarget: () => void;
  quotableQuestions: QuotableQuestion[];
  onQuoteQuestion: (q: QuotableQuestion) => void;
  signedIn: boolean;
  displayName: string | null;
  anonymous: boolean;
  onToggleAnonymous: (next: boolean) => void;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
}) {
  const t = useTranslations("report.comments");
  const ref = useRef<HTMLTextAreaElement>(null);

  // When a quote/reply target lands, bring the composer into view and focus it.
  useEffect(() => {
    if (target) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      ref.current?.focus();
    }
  }, [target]);

  if (!signedIn) {
    return (
      <div className={styles.composer__signin}>
        <FtlBody tone="muted">{t("signInToComment")}</FtlBody>
        <FtlLinkButton href={routes.signIn} variant="primary" size="sm">
          {t("signInCta")}
        </FtlLinkButton>
      </div>
    );
  }

  const over = value.length > COMMENT_MAX_LENGTH;
  const targetText =
    target?.kind === "question"
      ? t("quotingQuestion")
      : target?.kind === "comment"
        ? t("replyingTo", { name: target.authorLabel ?? t("someoneAnonymous") })
        : null;

  // Group the quotable questions by their round for the dropdown's <optgroup>s,
  // preserving the report's round order.
  const quoteGroups: { round: string; items: QuotableQuestion[] }[] = [];
  for (const q of quotableQuestions) {
    const last = quoteGroups[quoteGroups.length - 1];
    if (last && last.round === q.round) last.items.push(q);
    else quoteGroups.push({ round: q.round, items: [q] });
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && value.trim() && !over) onSubmit();
      }}
    >
      {target && (
        <div className={styles.composer__chip}>
          <span className={styles.composer__chipLabel}>{targetText}</span>
          <span className={styles.composer__chipText}>{target.text}</span>
          <button
            type="button"
            className={styles.composer__chipClear}
            onClick={onClearTarget}
            aria-label={t("clearQuote")}
          >
            ✕
          </button>
        </div>
      )}

      {quoteGroups.length > 0 && (
        <select
          className={styles.composer__quote}
          aria-label={t("quotePicker")}
          value=""
          onChange={(e) => {
            const q = quotableQuestions.find((x) => x.id === e.target.value);
            if (q) onQuoteQuestion(q);
            e.currentTarget.value = "";
          }}
        >
          <option value="">{t("quotePicker")}</option>
          {quoteGroups.map((g) => (
            <optgroup key={g.round} label={g.round}>
              {g.items.map((q) => (
                <option key={q.id} value={q.id}>
                  {truncate(q.prose, QUOTE_OPTION_MAX)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      <FtlTextarea
        ref={ref}
        className={styles.composer__textarea}
        placeholder={t("placeholder")}
        value={value}
        rows={3}
        maxLength={COMMENT_MAX_LENGTH + 100 /* allow over to show the error */}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className={styles.composer__foot}>
        <label className={styles.composer__attr}>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => onToggleAnonymous(e.target.checked)}
          />
          {anonymous || !displayName
            ? t("postAnonymous")
            : t("postAsName", { name: displayName })}
        </label>

        <div className={styles.composer__actions}>
          {over && (
            <span className={styles.composer__counter} data-over="true">
              {value.length}/{COMMENT_MAX_LENGTH}
            </span>
          )}
          <FtlButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={pending || !value.trim() || over}
          >
            {pending ? t("posting") : t("post")}
          </FtlButton>
        </div>
      </div>

      {error && (
        <FtlBody tone="muted" className={styles.composer__error}>
          {error === "rate_limited"
            ? t("errorRateLimited")
            : error === "too_long"
              ? t("errorTooLong")
              : t("errorGeneric")}
        </FtlBody>
      )}
    </form>
  );
}
