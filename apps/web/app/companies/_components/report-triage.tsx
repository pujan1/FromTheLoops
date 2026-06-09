"use client";

// ADR-0010 — the desktop master-detail triage pane, layered ON TOP of the
// existing list. The list (master) stays exactly as the SSR surface renders it;
// this client layer intercepts a plain row click and renders the report in a
// right-hand pane instead of doing a full round-trip to /reports/:id. The per-
// report SSR page is untouched — it's still the canonical/shareable address, the
// crawler/no-JS target, and the hard-nav fallback (every card keeps its real
// <a href>; only a plain left-click is intercepted).
//
// The engine walks the WHOLE filtered result set via `orderedIds` (from the
// ordered-ID provider), not just the visible page, so prev/next flips through
// every match. Selection shallow-updates the URL to the real /reports/:id
// (shareable, refresh-safe) without poisoning Back: one push on first open, then
// replace on every step, so Back exits to the list rather than walking the peek
// chain.
//
// Below 1024px the pane is hidden (CSS) and the list behaves exactly as today —
// the mobile bottom sheet is a fast-follow (ADR-0010 §Deferred).

import type { CellReportListItem, ReportDetailView } from "@fromtheloop/db";
import type { ReportFilters } from "@fromtheloop/shared";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReportDetailBody } from "@/app/reports/[id]/report-detail-body";
import { Pagination, ReportList } from "@/components/reports";
import { FtlBody, FtlButton } from "@/components/ui";
import { routes } from "@/lib/routes";
import { track } from "@/lib/track";
import styles from "./report-triage.module.css";

// What the detail route handler returns for one report.
interface Peek {
  detail: ReportDetailView;
  authorName: string | null;
  helpfulCount: number;
}

// The id embedded in a /reports/:id path, or null for any other path (list URL,
// pagination links, topic links). Used to tell an interceptable row click apart
// from an ordinary navigation, and to sync the pane to back/forward.
function reportIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/reports\/([^/]+)$/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

export function ReportTriage({
  items,
  orderedIds,
  companyName,
  startIndex,
  basePath,
  filters,
  total,
}: {
  items: CellReportListItem[];
  orderedIds: string[];
  companyName: string;
  startIndex: number;
  basePath: string;
  filters: ReportFilters;
  total: number;
}) {
  const t = useTranslations("report");

  // Instant re-peek + back-nav: a per-session detail cache and an in-flight
  // dedupe so a hover-prefetch and a click never double-fetch the same report.
  const cache = useRef(new Map<string, Peek>());
  const inflight = useRef(new Map<string, Promise<Peek | null>>());
  // selectedRef mirrors selectedId for use inside event handlers / async tails
  // without re-binding listeners on every selection.
  const selectedRef = useRef<string | null>(null);
  const dwell = useRef<{ id: string; at: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (id: string): Promise<Peek | null> => {
    const hit = cache.current.get(id);
    if (hit) return hit;
    let p = inflight.current.get(id);
    if (!p) {
      p = fetch(`/api/reports/${encodeURIComponent(id)}`)
        .then(async (res) => {
          if (!res.ok) return null;
          const data = (await res.json()) as Peek;
          cache.current.set(id, data);
          return data;
        })
        .catch(() => null)
        .finally(() => {
          inflight.current.delete(id);
        });
      inflight.current.set(id, p);
    }
    return p;
  }, []);

  const prefetch = useCallback(
    (id: string | undefined) => {
      if (!id || cache.current.has(id)) return;
      void fetchDetail(id);
    },
    [fetchDetail],
  );

  const flushDwell = useCallback(() => {
    if (dwell.current) {
      track("peek_dwell", {
        id: dwell.current.id,
        ms: Date.now() - dwell.current.at,
      });
      dwell.current = null;
    }
  }, []);

  // The select engine. `history` controls depth: the first open from a closed
  // pane pushes (Back → list); every step replaces (Back never walks the chain);
  // a popstate-driven open touches no history at all.
  const select = useCallback(
    async (
      id: string,
      opts: { step: boolean; history: "push" | "replace" | "none" },
    ) => {
      flushDwell();
      selectedRef.current = id;
      setSelectedId(id);
      const cached = cache.current.get(id) ?? null;
      setPeek(cached);
      setLoading(cached === null);

      const url = routes.report(id);
      if (opts.history === "push") window.history.pushState(null, "", url);
      else if (opts.history === "replace")
        window.history.replaceState(null, "", url);

      track(opts.step ? "peek_step" : "peek_open", { id });
      dwell.current = { id, at: Date.now() };

      const data = cached ?? (await fetchDetail(id));
      // Drop a stale resolve: the user stepped on while this was in flight.
      if (selectedRef.current !== id) return;
      setPeek(data);
      setLoading(false);

      const idx = orderedIds.indexOf(id);
      if (idx >= 0) prefetch(orderedIds[idx + 1]);
    },
    [fetchDetail, prefetch, flushDwell, orderedIds],
  );

  const open = useCallback(
    (id: string) => {
      const fresh = selectedRef.current === null;
      void select(id, { step: false, history: fresh ? "push" : "replace" });
    },
    [select],
  );

  const step = useCallback(
    (delta: number) => {
      const idx = selectedRef.current
        ? orderedIds.indexOf(selectedRef.current)
        : -1;
      const next = idx >= 0 ? orderedIds[idx + delta] : undefined;
      if (next) void select(next, { step: true, history: "replace" });
    },
    [orderedIds, select],
  );

  // Close → Back to the list URL. We pushed exactly one entry on open, so one
  // pop lands on the list and fires popstate (which clears the pane below).
  const close = useCallback(() => {
    window.history.back();
  }, []);

  // Back/forward sync: a /reports/:id in the URL re-opens it (no extra history);
  // the list URL closes the pane.
  useEffect(() => {
    const onPop = () => {
      const id = reportIdFromPath(window.location.pathname);
      if (id) {
        if (selectedRef.current !== id)
          void select(id, { step: false, history: "none" });
      } else {
        flushDwell();
        selectedRef.current = null;
        setSelectedId(null);
        setPeek(null);
        setLoading(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [select, flushDwell]);

  // Esc closes the pane.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedRef.current !== null) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Flush any pending dwell when the user leaves the page entirely.
  useEffect(() => flushDwell, [flushDwell]);

  // Intercept a plain left-click on a report row → open in the pane. Modified
  // clicks (new tab), middle-click (fires auxclick, not click), and the no-JS
  // path all keep the real <a href> → the SSR page.
  const onListClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const id = reportIdFromPath(new URL(anchor.href).pathname);
      if (!id) return; // pagination / other links navigate normally
      e.preventDefault();
      open(id);
    },
    [open],
  );

  // Hover-prefetch (desktop intent), debounced ~120ms so a mouse sweep down the
  // list doesn't fire a fetch per row.
  const onListHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const id = reportIdFromPath(new URL(anchor.href).pathname);
      if (!id || cache.current.has(id)) return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => prefetch(id), 120);
    },
    [prefetch],
  );
  const cancelHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const idx = selectedId ? orderedIds.indexOf(selectedId) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < orderedIds.length - 1;

  return (
    <div className={styles.split}>
      {/* Master — the unchanged list, plus its foot + real-link pager. */}
      <div
        className={styles.master}
        onClick={onListClick}
        onMouseOver={onListHover}
        onMouseLeave={cancelHover}
      >
        <ReportList
          items={items}
          companyName={companyName}
          startIndex={startIndex}
          activeId={selectedId ?? undefined}
        />
        {total > 0 && (
          <p className={styles.foot}>
            Showing {startIndex + 1}–{startIndex + items.length} of {total}
          </p>
        )}
        <Pagination basePath={basePath} filters={filters} total={total} />
      </div>

      {/* Detail pane — hidden below 1024px (CSS). Empty until a row is opened,
          keeping the bare list URL honest as the canonical list address. */}
      <aside className={styles.detail}>
        {selectedId == null ? (
          <div className={styles.placeholder}>
            <FtlBody tone="muted">
              Select a report to preview it here — the list stays put.
            </FtlBody>
          </div>
        ) : (
          <div className={styles.pane} aria-live="polite">
            <div className={styles.paneBar}>
              <div className={styles.stepGroup}>
                <FtlButton
                  size="sm"
                  variant="ghost"
                  disabled={!hasPrev}
                  onClick={() => step(-1)}
                  aria-label="Previous report"
                >
                  ←
                </FtlButton>
                <FtlButton
                  size="sm"
                  variant="ghost"
                  disabled={!hasNext}
                  onClick={() => step(1)}
                  aria-label="Next report"
                >
                  →
                </FtlButton>
                {idx >= 0 && (
                  <span className={styles.counter}>
                    {idx + 1} / {orderedIds.length}
                  </span>
                )}
              </div>
              <FtlButton
                size="sm"
                variant="ghost"
                onClick={close}
                aria-label="Close preview (Esc)"
              >
                Esc ✕
              </FtlButton>
            </div>

            {peek ? (
              <>
                <ReportDetailBody
                  detail={peek.detail}
                  eyebrow={t("detail.publicEyebrow")}
                  byline={
                    peek.authorName
                      ? t("detail.by", { name: peek.authorName })
                      : t("detail.anonymous")
                  }
                />
                <p className={styles.helpfulCount}>
                  {t("helpful.count", { count: peek.helpfulCount })}
                </p>
                {/* Real navigation (no preventDefault) → the canonical SSR page,
                    where flagging + owner controls live. The commit step. */}
                <a
                  className={styles.openFull}
                  href={routes.report(peek.detail.id)}
                  onClick={() => track("open_full", { id: peek.detail.id })}
                >
                  Open full report ↗
                </a>
              </>
            ) : loading ? (
              <FtlBody tone="muted">Loading…</FtlBody>
            ) : (
              <FtlBody tone="muted">
                Couldn’t load this preview.{" "}
                <a href={routes.report(selectedId)}>Open it directly ↗</a>
              </FtlBody>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
