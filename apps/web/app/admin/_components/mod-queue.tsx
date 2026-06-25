"use client";

// <ModQueue> (Sprint 6 Day 2) — the one component behind every moderation queue.
// It owns the chrome (filter, selection, action buttons, reason capture, bulk
// bar, empty/pending/error states); the queue page owns only the data + the
// server action. See queue-config.ts for the contract.
//
// State model: items live in local state so a successful action can drop exactly
// the processed rows without a round-trip. A reason-requiring or confirm action
// opens a small prompt scoped to a row or to the current bulk selection; firing
// runs the server action inside a transition.

import { useMemo, useState, useTransition } from "react";
import { FtlInput, FtlTextarea } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import type {
  ModQueueItem,
  QueueAction,
  QueueActionFn,
  QueueConfig,
} from "../queues/queue-config";
import { haystack } from "./mod-queue.helpers";
import styles from "./mod-queue.module.css";

type Prompt = {
  action: QueueAction;
  ids: string[];
  scope: "row" | "bulk";
};

export function ModQueue({
  config,
  items: initialItems,
  action: runAction,
}: {
  config: QueueConfig;
  items: ModQueueItem[];
  action: QueueActionFn;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((it) => haystack(it).includes(q)) : items;
  }, [items, filter]);

  const filteredIds = useMemo(() => filtered.map((it) => it.id), [filtered]);
  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (filteredIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...filteredIds]);
    });
  }

  // Decide how an action button should behave: confirm gate, then either open a
  // reason prompt or fire straight away.
  function trigger(action: QueueAction, ids: string[], scope: "row" | "bulk") {
    if (ids.length === 0) return;
    if (action.confirm && !window.confirm(action.confirm)) return;
    if (action.requiresReason) {
      setReason("");
      setError(null);
      setPrompt({ action, ids, scope });
      return;
    }
    fire(action, ids, scope);
  }

  function fire(action: QueueAction, ids: string[], _scope: "row" | "bulk", why?: string) {
    setError(null);
    startTransition(async () => {
      const result = await runAction({
        queueId: config.id,
        actionId: action.id,
        itemIds: ids,
        reason: why,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const done = new Set(result.processed);
      setItems((prev) => prev.filter((it) => !done.has(it.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        done.forEach((id) => next.delete(id));
        return next;
      });
      setPrompt(null);
    });
  }

  const selectedCount = filteredIds.filter((id) => selected.has(id)).length;

  return (
    <section className={styles.queue} aria-label={config.title}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{config.title}</h1>
          <p className={styles.desc}>{config.description}</p>
        </div>
        <span className={styles.count}>{items.length} pending</span>
      </header>

      {items.length > 0 && (
        <div className={styles.controls}>
          <FtlInput
            type="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={`Filter ${config.title}`}
            className={styles.filter}
          />
          {config.bulk && (
            <label className={styles.selectAll}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
              Select all ({filtered.length})
            </label>
          )}
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {/* Bulk action bar — only when a bulk queue has a live selection. */}
      {config.bulk && selectedCount > 0 && (
        <div className={styles.bulkBar} role="region" aria-label="Bulk actions">
          <span className={styles.bulkCount}>{selectedCount} selected</span>
          <div className={styles.actions}>
            {config.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={pending}
                className={`${styles.action} ${styles[`action--${a.variant}`]}`}
                onClick={() =>
                  trigger(
                    a,
                    filteredIds.filter((id) => selected.has(id)),
                    "bulk",
                  )
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {items.length === 0 ? config.emptyText : "No items match the filter."}
        </p>
      ) : (
        <ul className={styles.list}>
          {filtered.map((item) => {
            const promptingThisRow =
              prompt?.scope === "row" && prompt.ids.length === 1 && prompt.ids[0] === item.id;
            return (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemMain}>
                  {config.bulk && (
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      aria-label={`Select ${item.primary}`}
                    />
                  )}
                  <div className={styles.itemBody}>
                    <div className={styles.itemHead}>
                      <span className={styles.primary}>{item.primary}</span>
                      {item.badges?.map((b, i) => (
                        <span
                          key={i}
                          className={`${styles.badge} ${styles[`badge--${b.tone ?? "neutral"}`]}`}
                        >
                          {b.label}
                        </span>
                      ))}
                      {item.createdAt && (
                        <span className={styles.age} title={item.createdAt}>
                          {relativeTime(item.createdAt)}
                        </span>
                      )}
                    </div>
                    {item.secondary && (
                      <p className={styles.secondary}>{item.secondary}</p>
                    )}
                    {item.fields && item.fields.length > 0 && (
                      <dl className={styles.fields}>
                        {item.fields.map((f, i) => (
                          <div key={i} className={styles.fieldRow}>
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {item.detail && <div className={styles.detail}>{item.detail}</div>}
                    {item.href && (
                      <a className={styles.link} href={item.href} target="_blank" rel="noreferrer">
                        Inspect ↗
                      </a>
                    )}
                  </div>
                  <div className={styles.actions}>
                    {config.actions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={pending}
                        className={`${styles.action} ${styles[`action--${a.variant}`]}`}
                        onClick={() => trigger(a, [item.id], "row")}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {promptingThisRow && (
                  <ReasonPrompt
                    action={prompt.action}
                    reason={reason}
                    setReason={setReason}
                    pending={pending}
                    onCancel={() => setPrompt(null)}
                    onConfirm={() => fire(prompt.action, prompt.ids, prompt.scope, reason)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Bulk reason prompt lives below the bar (row prompts render inline). */}
      {prompt?.scope === "bulk" && (
        <ReasonPrompt
          action={prompt.action}
          reason={reason}
          setReason={setReason}
          pending={pending}
          onCancel={() => setPrompt(null)}
          onConfirm={() => fire(prompt.action, prompt.ids, prompt.scope, reason)}
          summary={`${prompt.ids.length} item(s)`}
        />
      )}
    </section>
  );
}

function ReasonPrompt({
  action,
  reason,
  setReason,
  pending,
  onCancel,
  onConfirm,
  summary,
}: {
  action: QueueAction;
  reason: string;
  setReason: (v: string) => void;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  summary?: string;
}) {
  const valid = reason.trim().length > 0;
  return (
    <div className={styles.prompt}>
      <label className={styles.promptLabel}>
        Reason for <strong>{action.label.toLowerCase()}</strong>
        {summary ? ` (${summary})` : ""} — logged
      </label>
      <FtlTextarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this being actioned? Written to the audit log."
        autoFocus
      />
      <div className={styles.promptActions}>
        <button type="button" className={styles.action} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles[`action--${action.variant}`]}`}
          onClick={onConfirm}
          disabled={pending || !valid}
        >
          Confirm {action.label.toLowerCase()}
        </button>
      </div>
    </div>
  );
}
