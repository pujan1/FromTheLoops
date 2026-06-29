"use client";

// Client editor for the name blocklist (Sprint 6 Day 9). Add / toggle / delete
// entries via the server actions, plus a live tester: type a sample name and see
// which enabled patterns it would trip — compiled client-side from the same
// rows, so a mod can sanity-check a new pattern before saving it.

import { useMemo, useState, useTransition } from "react";
import type { BlocklistCategory, BlocklistEntry } from "@fromtheloop/db";
import {
  createBlocklistEntry,
  deleteBlocklistEntry,
  toggleBlocklistEntry,
} from "./actions";
import styles from "./page.module.css";

const CATEGORIES: BlocklistCategory[] = ["slur", "pii", "spam", "other"];
const PATTERN_MAX = 200;

// Mirror of validateBlocklistInput in @fromtheloop/db (kept local so this client
// component doesn't import the server-only db barrel).
function localValidate(pattern: string, label: string): string | null {
  const p = pattern.trim();
  if (!p) return "Pattern is required.";
  if (p.length > PATTERN_MAX) return `Pattern must be ≤ ${PATTERN_MAX} characters.`;
  if (!label.trim()) return "Label is required.";
  try {
    new RegExp(p, "i");
  } catch (err) {
    return `Invalid regex: ${err instanceof Error ? err.message : "could not compile"}`;
  }
  return null;
}

export function BlocklistEditor({ entries }: { entries: BlocklistEntry[] }) {
  const [pattern, setPattern] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<BlocklistCategory>("slur");
  const [sample, setSample] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Which enabled patterns the sample name trips, compiled client-side.
  const sampleHits = useMemo(() => {
    const s = sample.trim();
    if (!s) return [];
    return entries
      .filter((e) => e.enabled)
      .filter((e) => {
        try {
          return new RegExp(e.pattern, "i").test(s);
        } catch {
          return false;
        }
      })
      .map((e) => e.label);
  }, [sample, entries]);

  function onAdd() {
    const v = localValidate(pattern, label);
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createBlocklistEntry({ pattern, label, category });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPattern("");
      setLabel("");
    });
  }

  function onToggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const res = await toggleBlocklistEntry(id, enabled);
      if (!res.ok) setError(res.error);
    });
  }

  function onDelete(id: string, label: string) {
    if (!confirm(`Delete blocklist entry “${label}”? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteBlocklistEntry(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={styles.editor}>
      <section className={styles.addCard}>
        <h2 className={styles.addTitle}>Add pattern</h2>
        <div className={styles.addGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Regex</span>
            <input
              className={styles.input}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="\\bslur\\b"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Label</span>
            <input
              className={styles.input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What it catches"
            />
          </label>
          <label className={styles.fieldNarrow}>
            <span className={styles.fieldLabel}>Category</span>
            <select
              className={styles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value as BlocklistCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.addBtn} onClick={onAdd} disabled={pending}>
            Add
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </section>

      <section className={styles.testCard}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Test a name against the active set</span>
          <input
            className={styles.input}
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            placeholder="e.g. Acme Corp"
            spellCheck={false}
          />
        </label>
        {sample.trim() && (
          <p className={sampleHits.length ? styles.testBlocked : styles.testOk}>
            {sampleHits.length
              ? `Blocked by: ${sampleHits.join(", ")}`
              : "Would auto-approve (no match)."}
          </p>
        )}
      </section>

      {entries.length === 0 ? (
        <p className={styles.empty}>No patterns yet. Add one above.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => (
            <li
              key={e.id}
              className={`${styles.row} ${e.enabled ? "" : styles.rowOff}`}
            >
              <code className={styles.pattern}>{e.pattern}</code>
              <span className={styles.rowLabel}>{e.label}</span>
              <span className={`${styles.cat} ${styles[`cat--${e.category}`]}`}>
                {e.category}
              </span>
              <div className={styles.rowActions}>
                <button
                  className={styles.linkBtn}
                  onClick={() => onToggle(e.id, !e.enabled)}
                  disabled={pending}
                >
                  {e.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  className={`${styles.linkBtn} ${styles.danger}`}
                  onClick={() => onDelete(e.id, e.label)}
                  disabled={pending}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
