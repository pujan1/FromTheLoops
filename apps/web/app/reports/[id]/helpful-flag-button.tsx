"use client";

// The helpful-flag control on a report detail page (Sprint 5 Day 8).
//
// A client component so the toggle feels instant: useActionState threads the
// {flagged, count, error} state through toggleHelpfulFlagAction and swaps the
// button in place, while the action's revalidatePath refreshes the SSR count
// for the next load. Whether the viewer is ALLOWED to flag (signed in, verified,
// not the author) is decided on the server and passed as `canFlag`; when false
// we render the count read-only plus the reason hint. Every guard is re-checked
// server-side, so this gating is UX, not security.

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FtlBody, FtlButton } from "@/components/ui";
import {
  type HelpfulFlagState,
  toggleHelpfulFlagAction,
} from "./actions";
import styles from "./reports.module.css";

export function HelpfulFlagButton({
  reportId,
  initialFlagged,
  initialCount,
  canFlag,
  // Why the viewer can't flag (signed-out / unverified / author) — drives the
  // read-only hint. Ignored when canFlag is true.
  reason,
}: {
  reportId: string;
  initialFlagged: boolean;
  initialCount: number;
  canFlag: boolean;
  reason?: "signIn" | "verify" | "author";
}) {
  const t = useTranslations("report.helpful");
  const [state, formAction, pending] = useActionState<HelpfulFlagState, FormData>(
    toggleHelpfulFlagAction,
    { flagged: initialFlagged, count: initialCount, error: null },
  );

  const errorMessage =
    state.error === "rate_limited"
      ? t("rateLimited")
      : state.error && state.error !== "self_flag"
        ? t("error")
        : null;

  return (
    <section className={styles.helpful}>
      <p className={styles.helpful__heading}>{t("heading")}</p>
      <p className={styles.helpful__count} aria-live="polite">
        {t("count", { count: state.count })}
      </p>

      {canFlag ? (
        <form action={formAction}>
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="count" value={state.count} />
          <input type="hidden" name="flagged" value={state.flagged ? "1" : "0"} />
          <FtlButton
            type="submit"
            variant={state.flagged ? "primary" : "ghost"}
            size="sm"
            aria-pressed={state.flagged}
            disabled={pending}
          >
            {state.flagged ? t("flagged") : t("flag")}
          </FtlButton>
          {errorMessage && (
            <FtlBody tone="muted" className={styles.helpful__hint}>
              {errorMessage}
            </FtlBody>
          )}
        </form>
      ) : (
        reason && (
          <FtlBody tone="muted" className={styles.helpful__hint}>
            {reason === "signIn" && t("signInHint")}
            {reason === "verify" && t("verifyHint")}
            {reason === "author" && t("authorHint")}
          </FtlBody>
        )
      )}
    </section>
  );
}
