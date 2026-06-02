"use client";

// Top-level submission fields (Sprint 1 Day 5–6). Client component: holds
// form state, drives the two taxonomy Comboboxes off the /api/taxonomy
// lookups, validates with the shared Zod schema, and routes to the Rounds
// stub on success.
//
// Day 6: debounced server-side autosave. Any change schedules a saveDraft
// 2s after the last keystroke; the first save on a fresh form creates the
// draft and shallow-rewrites the URL to /drafts/[id] (native History API, no
// remount) so a refresh resumes via the RSC route. A draft loaded from
// /drafts/[id] hydrates initial state below.

import {
  attributionSchema,
  type CompanySelection,
  DISPLAY_ATTRIBUTIONS,
  HONEYPOT_FIELD,
  type LevelSelection,
  REPORT_OUTCOMES,
  type ReportOutcome,
  type SubmissionDraft,
  submissionReadySchema,
} from "@fromtheloop/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Body, Button, Combobox, type ComboboxOption } from "@/components/ui";
import { saveDraft } from "./actions";
import styles from "./submit.module.css";

const PENDING_PREFIX = "pending:";
const AUTOSAVE_DELAY_MS = 2000;

// "YYYY-MM" for <input type="month">; defaults the interview month.
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface LevelOption {
  id: string;
  slug: string;
  name: string;
}

// --- taxonomy fetchers (the Combobox `search` props) -----------------
async function searchCompanies(q: string): Promise<ComboboxOption[]> {
  const res = await fetch(`/api/taxonomy/companies?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    matches: { id: string; name: string; domain: string | null }[];
  };
  return data.matches.map((m) => ({
    id: m.id,
    label: m.name,
    hint: m.domain ?? undefined,
  }));
}

async function searchRoles(q: string): Promise<ComboboxOption[]> {
  const res = await fetch(`/api/taxonomy/roles?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { matches: { id: string; name: string }[] };
  return data.matches.map((m) => ({ id: m.id, label: m.name }));
}

// --- selection <-> Combobox option mapping ---------------------------
// A "pending:" id marks a suggest-new company with no row yet (the submit
// action creates it later).
function toCompanySelection(
  option: ComboboxOption | null,
): CompanySelection | null {
  if (!option) return null;
  if (option.id.startsWith(PENDING_PREFIX)) {
    return { kind: "suggested", name: option.label };
  }
  return { kind: "existing", id: option.id, name: option.label };
}

function companySelectionToOption(
  c: CompanySelection | null | undefined,
): ComboboxOption | null {
  if (!c) return null;
  // No hint here: a restored selection only renders its label in the input;
  // the hint is dropdown-option chrome, set at suggest time below.
  if (c.kind === "suggested") {
    return { id: `${PENDING_PREFIX}${c.name}`, label: c.name };
  }
  return { id: c.id, label: c.name };
}

const NA_LEVEL: LevelSelection = { id: null, name: "N/A" };

type FieldErrors = Partial<
  Record<"company" | "role" | "level" | "month", string>
>;

type SaveState = "idle" | "saving" | "saved" | "error";

export interface SubmitFormProps {
  initialDraftId?: string;
  initialData?: SubmissionDraft | null;
}

export function SubmitForm({ initialDraftId, initialData }: SubmitFormProps) {
  const t = useTranslations("submit");
  const router = useRouter();
  const baseId = useId();

  const [company, setCompany] = useState<ComboboxOption | null>(() =>
    companySelectionToOption(initialData?.company),
  );
  const [role, setRole] = useState<ComboboxOption | null>(() =>
    initialData?.role
      ? { id: initialData.role.id, label: initialData.role.name }
      : null,
  );
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [level, setLevel] = useState<LevelSelection | null>(
    initialData?.level ?? null,
  );
  const [outcome, setOutcome] = useState<ReportOutcome | null>(
    initialData?.outcome ?? null,
  );
  const [month, setMonth] = useState<string>(
    initialData?.month ?? currentMonth(),
  );
  const [attribution, setAttribution] = useState<
    (typeof DISPLAY_ATTRIBUTIONS)[number]
  >(initialData?.attribution ?? "anonymous");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Honeypot (Day 8): an off-screen decoy input. Uncontrolled + read by ref
  // at save time so it never participates in render/autosave-trigger logic —
  // a human leaves it blank, a bot fills it and the action drops the write.
  const honeypotRef = useRef<HTMLInputElement>(null);

  const isSuggestedCompany = company?.id.startsWith(PENDING_PREFIX) ?? false;

  // Load the per-company level ladder whenever the company changes. The
  // *selected* level is reset by handleCompanyChange (user action), not here,
  // so hydrating a saved draft keeps its restored level.
  useEffect(() => {
    if (!company) {
      setLevels([]);
      return;
    }
    if (isSuggestedCompany) {
      setLevels([]);
      setLevel(NA_LEVEL);
      return;
    }
    let cancelled = false;
    setLevelsLoading(true);
    fetch(`/api/taxonomy/companies/${company.id}/levels`)
      .then((res) => (res.ok ? res.json() : { levels: [] }))
      .then((data: { levels: LevelOption[] }) => {
        if (cancelled) return;
        setLevels(data.levels);
        if (data.levels.length === 0) setLevel(NA_LEVEL);
        setLevelsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLevels([]);
        setLevel(NA_LEVEL);
        setLevelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company, isSuggestedCompany]);

  // The draft payload + a stable serialization used as the autosave trigger.
  const draftData = useMemo<Record<string, unknown>>(
    () => ({
      company: toCompanySelection(company),
      role: role ? { id: role.id, name: role.label } : null,
      level,
      outcome,
      month,
      attribution,
    }),
    [company, role, level, outcome, month, attribution],
  );
  const serialized = JSON.stringify(draftData);

  // Skip re-saving the exact state we last persisted (covers the pristine
  // initial render and the post-save re-render when draftId is set).
  const lastSavedRef = useRef(serialized);

  useEffect(() => {
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await saveDraft({
          id: draftId,
          data: draftData,
          honeypot: honeypotRef.current?.value ?? "",
        });
        lastSavedRef.current = serialized;
        // res.id is empty when the action silently dropped a honeypot-tripped
        // write; only adopt a real id (a human never trips it).
        if (!draftId && res.id) {
          setDraftId(res.id);
          // Shallow URL update (no remount) so a refresh resumes the draft.
          window.history.replaceState(null, "", `/drafts/${res.id}`);
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [serialized, draftId, draftData]);

  function handleCompanyChange(option: ComboboxOption | null) {
    setCompany(option);
    // New company → re-pick level (the effect sets N/A when there's no ladder).
    setLevel(null);
  }

  function handleLevelSelect(value: string) {
    if (value === "") {
      setLevel(null);
      return;
    }
    const match = levels.find((l) => l.id === value);
    if (match) setLevel({ id: match.id, name: match.name });
  }

  function handleContinue() {
    const candidate = {
      company: toCompanySelection(company),
      role: role ? { id: role.id, name: role.label } : null,
      level,
      outcome,
      month,
      attribution,
    };
    const parsed = submissionReadySchema.safeParse(candidate);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "company" ||
          key === "role" ||
          key === "level" ||
          key === "month"
        ) {
          next[key] ??= t(`errors.${key}`);
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    router.push("/submit/rounds");
  }

  const hasLevelLadder = levels.length > 0;

  return (
    <div className={styles.form}>
      {/* Honeypot — invisible to users, a trap for form-filling bots. The
          label looks legitimate ("Website") so bots target it; aria-hidden +
          tabIndex -1 + off-screen positioning keep it out of every human
          path. saveDraft drops any write where this comes back non-empty. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor={`${baseId}-website`}>Website</label>
        <input
          ref={honeypotRef}
          id={`${baseId}-website`}
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <Combobox
        label={t("company.label")}
        placeholder={t("company.placeholder")}
        value={company}
        onChange={handleCompanyChange}
        search={searchCompanies}
        onSuggestNew={(name) =>
          handleCompanyChange({
            id: `${PENDING_PREFIX}${name}`,
            label: name,
            hint: t("company.suggestHint"),
          })
        }
        required
      />
      {errors.company && <p className={styles.error}>{errors.company}</p>}

      <Combobox
        label={t("role.label")}
        placeholder={t("role.placeholder")}
        value={role}
        onChange={setRole}
        search={searchRoles}
        emptyMessage={t("role.empty")}
        required
      />
      {errors.role && <p className={styles.error}>{errors.role}</p>}

      {/* Level — per-company ladder, or N/A when the company has none. */}
      <div className={styles.field}>
        <label htmlFor={`${baseId}-level`} className={styles.label}>
          {t("level.label")}
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        </label>
        {!company ? (
          <p className={styles.hint}>{t("level.chooseCompany")}</p>
        ) : levelsLoading ? (
          <p className={styles.hint}>{t("level.loading")}</p>
        ) : hasLevelLadder ? (
          <select
            id={`${baseId}-level`}
            className={styles.select}
            value={level?.id ?? ""}
            onChange={(e) => handleLevelSelect(e.target.value)}
          >
            <option value="">{t("level.select")}</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : (
          <p className={styles.hint}>
            {t.rich("level.na", { strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
        )}
        {errors.level && <p className={styles.error}>{errors.level}</p>}
      </div>

      {/* Outcome — optional. */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>{t("outcome.legend")}</legend>
        <div className={styles.chips}>
          {REPORT_OUTCOMES.map((o) => (
            <label
              key={o}
              className={`${styles.chip} ${outcome === o ? styles.chipActive : ""}`}
            >
              <input
                type="radio"
                name="outcome"
                value={o}
                checked={outcome === o}
                onChange={() => setOutcome(o)}
                className={styles.srOnly}
              />
              {t(`outcome.${o}`)}
            </label>
          ))}
          {outcome && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setOutcome(null)}
            >
              {t("outcome.clear")}
            </button>
          )}
        </div>
      </fieldset>

      {/* Interview month. */}
      <div className={styles.field}>
        <label htmlFor={`${baseId}-month`} className={styles.label}>
          {t("month.label")}
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        </label>
        <input
          id={`${baseId}-month`}
          type="month"
          className={styles.input}
          value={month}
          max={currentMonth()}
          onChange={(e) => setMonth(e.target.value)}
        />
        {errors.month && <p className={styles.error}>{errors.month}</p>}
      </div>

      {/* Attribution toggle. */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>{t("attribution.legend")}</legend>
        <div className={styles.chips}>
          {DISPLAY_ATTRIBUTIONS.map((a) => (
            <label
              key={a}
              className={`${styles.chip} ${attribution === a ? styles.chipActive : ""}`}
            >
              <input
                type="radio"
                name="attribution"
                value={a}
                checked={attribution === a}
                onChange={() => setAttribution(attributionSchema.parse(a))}
                className={styles.srOnly}
              />
              {t(`attribution.${a}`)}
            </label>
          ))}
        </div>
        <Body size="small" tone="muted" style={{ marginTop: 8 }}>
          {t("attribution.note")}
        </Body>
      </fieldset>

      <div className={styles.actions}>
        <Button
          variant="primary"
          trailingArrow
          onClick={handleContinue}
          disabled={submitting}
        >
          {t("continue")}
        </Button>
        <span className={styles.saveState} aria-live="polite">
          {saveState === "saving" && t("save.saving")}
          {saveState === "saved" && t("save.saved")}
          {saveState === "error" && t("save.error")}
        </span>
      </div>
    </div>
  );
}
