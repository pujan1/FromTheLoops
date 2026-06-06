"use client";

// Combobox — accessible autocomplete with a debounced async search and an
// optional "suggest new" affordance.
//
// Decoupled from the data source on purpose: callers pass a `search` function,
// so the same component backs both the company field (suggest-new ON) and the
// canonical-role field (suggest-new OFF — closed set).
//
// Follows the WAI-ARIA 1.2 combobox-with-listbox pattern: input is
// role=combobox + aria-activedescendant; the popup is role=listbox; rows are
// role=option. Keyboard: ↑/↓ move, Enter selects, Esc closes, Tab commits out.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import styles from "./combobox.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface ComboboxOption {
  id: string;
  label: string;
  // Secondary text shown muted alongside the label (e.g. a company domain).
  hint?: string;
}

export interface ComboboxProps {
  label: string;
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  // Debounced async lookup. Should return [] for an empty query.
  search: (query: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  // Presence of onSuggestNew enables the "suggest new" row when a non-empty
  // query has no exact (case-insensitive) label match. Roles omit this.
  onSuggestNew?: (query: string) => void;
  // Copy for the suggest-new row; defaults to: Suggest "<query>"
  suggestNewLabel?: (query: string) => string;
  debounceMs?: number;
  emptyMessage?: string;
  required?: boolean;
  // When set, a hidden input posts the selected option id under this name
  // (so the field works inside a plain <form> / server action).
  name?: string;
  disabled?: boolean;
  // Multi-select mode: after a pick (option or suggest-new) the input clears
  // instead of mirroring the label, and focus stays put so the next item can
  // be typed immediately. The parent owns the chosen set; this stays value=null.
  clearOnSelect?: boolean;
}

// Special activeIndex value: the synthetic suggest-new row sits after the
// options, addressed as `options.length`.
export function FtlCombobox({
  label,
  value,
  onChange,
  search,
  placeholder,
  onSuggestNew,
  suggestNewLabel = (q) => `Suggest “${q}”`,
  debounceMs = 200,
  emptyMessage = "No matches.",
  required = false,
  name,
  disabled = false,
  clearOnSelect = false,
}: ComboboxProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const labelId = `${baseId}-label`;
  const statusId = `${baseId}-status`;

  // The text in the input. When a value is selected it mirrors the label;
  // typing diverges from the selection until a new pick is made.
  const [query, setQuery] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  // Monotonic request id so out-of-order async responses are dropped.
  const reqSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = query.trim();
  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  );
  const showSuggestNew =
    Boolean(onSuggestNew) && trimmed.length > 0 && !hasExactMatch;
  // Total navigable rows = options + (suggest-new ? 1 : 0).
  const rowCount = options.length + (showSuggestNew ? 1 : 0);
  const suggestIndex = showSuggestNew ? options.length : -1;
  // Only render the popup when it has something to show — otherwise an empty
  // query on focus would paint a bare, padded dropdown. The empty-state
  // message itself counts as content (so "no matches" still shows).
  const showEmptyMessage = !loading && rowCount === 0 && trimmed.length > 0;
  const popupHasContent = rowCount > 0 || showEmptyMessage;

  const runSearch = useCallback(
    (q: string) => {
      const seq = ++reqSeq.current;
      if (q.trim().length === 0) {
        setOptions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      search(q)
        .then((results) => {
          // Drop stale responses (a newer keystroke already fired).
          if (seq !== reqSeq.current) return;
          setOptions(results);
          setActiveIndex(results.length > 0 ? 0 : -1);
          setLoading(false);
        })
        .catch(() => {
          if (seq !== reqSeq.current) return;
          setOptions([]);
          setLoading(false);
        });
    },
    [search],
  );

  // Debounce the lookup on query change while the popup is open.
  useEffect(() => {
    if (!open) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(query), debounceMs);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, open, debounceMs, runSearch]);

  // Close on outside pointer.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function selectOption(option: ComboboxOption) {
    onChange(option);
    if (clearOnSelect) {
      // Multi-select: drop the text and stay open so the next tag can be typed.
      setQuery("");
      setOptions([]);
    } else {
      setQuery(option.label);
      setOpen(false);
    }
    setActiveIndex(-1);
  }

  function commitSuggestNew() {
    if (onSuggestNew && trimmed.length > 0) {
      onSuggestNew(trimmed);
      if (clearOnSelect) {
        setQuery("");
        setOptions([]);
        setActiveIndex(-1);
      } else {
        setOpen(false);
      }
    }
  }

  function commitActive() {
    if (activeIndex < 0) return;
    if (activeIndex === suggestIndex) {
      commitSuggestNew();
      return;
    }
    const option = options[activeIndex];
    if (option) selectOption(option);
  }

  function handleInput(next: string) {
    setQuery(next);
    setOpen(true);
    // Diverging from the current selection clears it until a new pick.
    if (value && next !== value.label) onChange(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (rowCount > 0) setActiveIndex((i) => (i + 1) % rowCount);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (rowCount > 0) setActiveIndex((i) => (i <= 0 ? rowCount - 1 : i - 1));
        break;
      case "Enter":
        if (open && activeIndex >= 0) {
          e.preventDefault();
          commitActive();
        } else if (open && showSuggestNew) {
          // No row is highlighted (a typed query with no matches leaves
          // activeIndex at -1), but a suggest-new row is on offer — Enter
          // accepts it, so typing a brand-new name + Enter just works.
          e.preventDefault();
          commitSuggestNew();
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const activeId =
    open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined;

  return (
    <div className={styles.combobox} ref={rootRef}>
      <label id={labelId} htmlFor={baseId} className={styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>

      <div className={styles.field}>
        <input
          id={baseId}
          type="text"
          className={styles.input}
          role="combobox"
          aria-expanded={open && popupHasContent}
          aria-controls={open && popupHasContent ? listId : undefined}
          aria-labelledby={labelId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-required={required}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {loading && <span className={styles.spinner} aria-hidden="true" />}
      </div>

      {name && <input type="hidden" name={name} value={value?.id ?? ""} />}

      {open && popupHasContent && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className={styles.listbox}
          // Keep focus on the input when clicking a row (so blur doesn't
          // close the popup before onClick fires).
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((option, i) => (
            <li
              key={option.id}
              id={`${baseId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={cx(styles.option, i === activeIndex && styles.optionActive)}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => selectOption(option)}
            >
              <span className={styles.optionLabel}>{option.label}</span>
              {option.hint && (
                <span className={styles.optionHint}>{option.hint}</span>
              )}
            </li>
          ))}

          {showSuggestNew && (
            <li
              id={`${baseId}-opt-${suggestIndex}`}
              role="option"
              aria-selected={activeIndex === suggestIndex}
              className={cx(
                styles.option,
                styles.suggest,
                activeIndex === suggestIndex && styles.optionActive,
              )}
              onMouseEnter={() => setActiveIndex(suggestIndex)}
              onClick={commitSuggestNew}
            >
              <span className={styles.suggestLabel}>
                {suggestNewLabel(trimmed)}
              </span>
              <span className={styles.suggestMeta}>new · pending review</span>
            </li>
          )}

          {showEmptyMessage && (
            <li className={styles.empty} role="presentation">
              {emptyMessage}
            </li>
          )}
        </ul>
      )}

      {/* Live region: announces result counts to screen readers. */}
      <span id={statusId} role="status" aria-live="polite" className={styles.srOnly}>
        {open && trimmed.length > 0
          ? loading
            ? "Searching…"
            : `${options.length} result${options.length === 1 ? "" : "s"}`
          : ""}
      </span>
    </div>
  );
}
