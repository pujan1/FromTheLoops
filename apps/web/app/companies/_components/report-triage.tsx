"use client";


import type { CellReportListItem, ReportDetailView } from "@fromtheloop/db";
import type { ReportFilters } from "@fromtheloop/shared";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConversationEngagement,
  ReportConversation,
} from "@/app/reports/[id]/report-conversation";
import { Pagination, ReportList } from "@/components/reports";
import { FtlBody, FtlButton } from "@/components/ui";
import { routes } from "@/lib/routes";
import { track } from "@/lib/track";
import styles from "./report-triage.module.css";
interface Peek {
  detail: ReportDetailView;
  authorName: string | null;
  signedIn: boolean;
  engagement: ConversationEngagement;
}


function reportIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/reports\/([^/]+)$/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}


function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function ReportTriage({
  items,
  orderedIds,
  companyName,
  startIndex,
  basePath,
  filters,
  total,
  emptyMessage,
}: {
  items: CellReportListItem[];
  orderedIds: string[];
  // Constant company label for single-company surfaces (role, company feed).
  // Omit on the cross-company profile feed — each row carries its own company.
  companyName?: string;
  startIndex: number;
  basePath: string;
  filters: ReportFilters;
  total: number;
  // Passthrough to the underlying list for surface-specific empty copy.
  emptyMessage?: string;
}) {
  const t = useTranslations("report");

  // Instant re-peek + back-nav: a per-session detail cache and an in-flight
  // dedupe so a hover-prefetch and a click never double-fetch the same report.
  const cache = useRef(new Map<string, Peek>());
  const inflight = useRef(new Map<string, Promise<Peek | null>>());
  // selectedRef mirrors selectedId for use inside event handlers / async tails
  // without re-binding listeners on every selection.
  const selectedRef = useRef<string | null>(null);
  const dwell = useRef<{ id: string; at: number; surface: string } | null>(
    null,
  );
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bottom-sheet gesture state: the sheet element (transformed directly during a
  // drag, bypassing React for smoothness) and the pointer-down origin.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

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
        surface: dwell.current.surface,
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

      // Which surface is live decides how to read the event later (the ADR's
      // device split). matchMedia mirrors the 1024px CSS breakpoint exactly.
      const surface = window.matchMedia("(min-width: 1024px)").matches
        ? "pane"
        : "sheet";
      track(opts.step ? "peek_step" : "peek_open", { id, surface });
      dwell.current = { id, at: Date.now(), surface };

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


  const onSheetPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a")) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onSheetPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || !sheetRef.current) return;
    const dy = e.clientY - dragStart.current.y;
    // Only follow a downward pull; upward/horizontal intent gets no rubber-band.
    if (dy > 0) {
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const onSheetPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStart.current;
      dragStart.current = null;
      if (sheetRef.current) {
        sheetRef.current.style.transition = "";
        sheetRef.current.style.transform = "";
      }
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dy > 110 && dy > Math.abs(dx)) {
        close(); // pulled down far enough → dismiss to the list
      } else if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy)) {
        step(dx < 0 ? 1 : -1); // swipe left = next, right = prev
      }
    },
    [close, step],
  );

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


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedRef.current === null) return;
      if (e.key === "Escape") {
        close();
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") {
        e.preventDefault();
        step(1);
      } else if (e.key === "k") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, step]);

  // Flush any pending dwell when the user leaves the page entirely.
  useEffect(() => flushDwell, [flushDwell]);

  // Lock the page behind the bottom sheet (mobile only) so a drag/scroll inside
  // the sheet never bleeds into the list underneath. No-op on desktop, where the
  // sheet isn't rendered and the sticky pane scrolls the page normally.
  useEffect(() => {
    if (selectedId == null) return;
    if (!window.matchMedia("(max-width: 1023.98px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedId]);

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

  // Prev / next / counter — shared chrome for the desktop pane and the sheet.
  const stepControls = (
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
  );

  const peekBody = peek ? (
    <ReportConversation
      detail={peek.detail}
      eyebrow={t("detail.publicEyebrow")}
      byline={
        peek.authorName
          ? t("detail.by", { name: peek.authorName })
          : t("detail.anonymous")
      }
      reportId={peek.detail.id}
      signedIn={peek.signedIn}
      engagement={peek.engagement}
      collapsedComments
    />
  ) : loading ? (
    <FtlBody tone="muted">Loading…</FtlBody>
  ) : (
    selectedId && (
      <FtlBody tone="muted">
        Couldn’t load this preview.{" "}
        <a href={routes.report(selectedId)}>Open it directly ↗</a>
      </FtlBody>
    )
  );

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
          emptyMessage={emptyMessage}
        />
        {total > 0 && (
          <p className={styles.foot}>
            Showing {startIndex + 1}–{startIndex + items.length} of {total}
          </p>
        )}
        <Pagination basePath={basePath} filters={filters} total={total} />
      </div>

      {/* Desktop detail pane — hidden below 1024px (CSS). Empty until a row is
          opened, keeping the bare list URL honest as the canonical list. */}
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
              {stepControls}
              <FtlButton
                size="sm"
                variant="ghost"
                onClick={close}
                aria-label="Close preview (Esc)"
              >
                Esc ✕
              </FtlButton>
            </div>
            {peekBody}
          </div>
        )}
      </aside>

      {/* Mobile bottom sheet — hidden ≥1024px (CSS), and only mounted once a row
          is opened. Same engine, same body; a drag on the header dismisses or
          steps. Backdrop tap closes. */}
      {selectedId != null && (
        <div
          className={styles.backdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={sheetRef}
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Report preview"
          >
            <div
              className={styles.sheetHeader}
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerUp}
              onPointerCancel={onSheetPointerUp}
            >
              <div className={styles.handle} aria-hidden="true" />
              <div className={styles.sheetBar}>
                {stepControls}
                <FtlButton
                  size="sm"
                  variant="ghost"
                  onClick={close}
                  aria-label="Close preview"
                >
                  ✕
                </FtlButton>
              </div>
            </div>
            <div className={styles.sheetBody} aria-live="polite">
              {peekBody}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
