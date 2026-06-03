"use client";

// Multi-select topic tagger for a single question. Wraps the single-select
// FtlCombobox (clearOnSelect mode) with a list of removable chips — the parent
// owns the chosen TopicTagSelection[], the combobox always stays value=null.
//
// Two kinds of tag, mirroring company selection:
//   - "existing": an active curated topic (uuid + slug). Only these count
//     toward the ≥1-active-tag finalize rule.
//   - "suggested": a user-typed name with no row yet. Finalize turns it into a
//     status='pending' topic via suggestTopic; until a mod promotes it, it's
//     parked and does NOT satisfy the tag requirement — so it's rendered with a
//     "pending" affordance to set that expectation.

import type { TopicTagSelection } from "@fromtheloop/shared";
import type { useTranslations } from "next-intl";
import { useRef } from "react";
import { type ComboboxOption, FtlCombobox, FtlTag } from "@/components/ui";
import styles from "../rounds.module.css";
import { searchTopics } from "./api";

interface TagPickerProps {
  tags: TopicTagSelection[];
  onChange: (next: TopicTagSelection[]) => void;
  // The "tags" namespace translator, passed down so the picker doesn't open a
  // second useTranslations subscription per question card.
  t: ReturnType<typeof useTranslations>;
}

// Stable identity for dedupe + chip keys: an existing tag is its id, a
// suggestion is its case-folded name (no id yet).
function tagKey(tag: TopicTagSelection): string {
  return tag.kind === "existing" ? tag.id : `suggested:${tag.name.toLowerCase()}`;
}

export function TagPicker({ tags, onChange, t }: TagPickerProps) {
  // id → slug/name from the latest search, so an option pick can be promoted to
  // a full "existing" selection (the combobox option only carries id + label).
  const matchIndex = useRef<Map<string, { slug: string; name: string }>>(
    new Map(),
  );

  async function search(query: string): Promise<ComboboxOption[]> {
    const matches = await searchTopics(query);
    for (const m of matches) matchIndex.current.set(m.id, { slug: m.slug, name: m.name });
    // Hide tags already chosen so they can't be added twice.
    const chosen = new Set(tags.map(tagKey));
    return matches
      .filter((m) => !chosen.has(m.id))
      .map((m) => ({ id: m.id, label: m.name }));
  }

  function addTag(tag: TopicTagSelection) {
    const key = tagKey(tag);
    if (tags.some((existing) => tagKey(existing) === key)) return;
    onChange([...tags, tag]);
  }

  function handleSelect(option: ComboboxOption | null) {
    if (!option) return;
    const match = matchIndex.current.get(option.id);
    addTag({
      kind: "existing",
      id: option.id,
      slug: match?.slug ?? option.id,
      name: match?.name ?? option.label,
    });
  }

  function handleSuggestNew(name: string) {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    // Don't re-suggest something already active in the list.
    const existsActive = tags.some(
      (tg) => tg.kind === "existing" && tg.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existsActive) return;
    addTag({ kind: "suggested", name: trimmed });
  }

  function removeTag(key: string) {
    onChange(tags.filter((tg) => tagKey(tg) !== key));
  }

  return (
    <div className={styles.tagPicker}>
      <FtlCombobox
        label={t("label")}
        placeholder={t("placeholder")}
        value={null}
        onChange={handleSelect}
        search={search}
        onSuggestNew={handleSuggestNew}
        suggestNewLabel={(q) => t("suggestNew", { name: q })}
        emptyMessage={t("empty")}
        clearOnSelect
      />

      {tags.length > 0 && (
        <ul className={styles.tagList} aria-label={t("selectedLabel")}>
          {tags.map((tag) => {
            const key = tagKey(tag);
            const pending = tag.kind === "suggested";
            return (
              <li key={key}>
                <FtlTag variant={pending ? "ghost" : "accent"}>
                  <span>{tag.name}</span>
                  {pending && (
                    <span className={styles.tagPending}>{t("pending")}</span>
                  )}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => removeTag(key)}
                    aria-label={t("remove", { name: tag.name })}
                  >
                    ×
                  </button>
                </FtlTag>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
