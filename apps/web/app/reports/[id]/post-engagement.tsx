"use client";

// The post-level engagement row (ADR-0011): a casual Like (any signed-in user,
// no karma) and Share (native share sheet with a copy-link fallback). The
// verified, karma-weighted Helpful flag stays its own separate control.

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { logShareAction, togglePostLikeAction } from "./comment-actions";
import styles from "./reports.module.css";

export function PostEngagement({
  reportId,
  signedIn,
  initialLiked,
  initialLikeCount,
}: {
  reportId: string;
  signedIn: boolean;
  initialLiked: boolean;
  initialLikeCount: number;
}) {
  const t = useTranslations("report");
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialLikeCount);
  const [shared, setShared] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleLike(): void {
    if (pending) return;
    if (!signedIn) {
      window.location.href = routes.signIn;
      return;
    }
    setLiked((v) => !v);
    setCount((c) => c + (liked ? -1 : 1));
    startTransition(async () => {
      const res = await togglePostLikeAction(reportId);
      setLiked(res.liked);
      setCount(res.count);
    });
  }

  async function share(): Promise<void> {
    const url = typeof window !== "undefined" ? window.location.href : "";
    void logShareAction(reportId);
    // Native share sheet where available (mostly mobile); copy-link otherwise.
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // user cancelled or it failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // clipboard blocked — nothing more we can do silently
    }
  }

  return (
    <div className={styles.engagement}>
      <button
        type="button"
        className={styles.engagement__btn}
        data-on={liked}
        onClick={toggleLike}
        disabled={pending}
        aria-pressed={liked}
      >
        ♥ <span>{liked ? t("likes.liked") : t("likes.like")}</span>
        {count > 0 && <span className={styles.engagement__count}>{count}</span>}
      </button>

      <button
        type="button"
        className={styles.engagement__btn}
        onClick={() => void share()}
      >
        ↗ <span>{shared ? t("share.copied") : t("share.share")}</span>
      </button>
    </div>
  );
}
