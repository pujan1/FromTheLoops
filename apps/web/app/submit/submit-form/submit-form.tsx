"use client";

// Top-level submission fields: validates with the shared schema, autosaves the
// draft (debounced), then routes to the rounds screen on Continue.

import {
  DISPLAY_ATTRIBUTIONS,
  type DisplayAttribution,
  type LevelSelection,
  REPORT_OUTCOMES,
  type ReportOutcome,
  submissionReadySchema,
} from "@fromtheloop/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FtlBody,
  FtlButton,
  FtlChoiceChips,
  FtlCombobox,
  type ComboboxOption,
  FtlField,
  FtlHoneypot,
  FtlInput,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { saveDraft, suggestPendingCompany } from "../actions";
import styles from "../submit.module.css";
import { fetchLevels, searchCompanies, searchRoles } from "./api";
import { LevelField } from "./level-field";
import {
  AUTOSAVE_DELAY_MS,
  companySelectionToOption,
  currentMonth,
  NA_LEVEL,
  PENDING_PREFIX,
  toCompanySelection,
} from "./helpers";
import type {
  FieldErrors,
  LevelOption,
  SaveState,
  SubmitFormProps,
} from "./types";

export function SubmitForm({ initialDraftId, initialData }: SubmitFormProps) {
  const t = useTranslations("submit");
  const router = useRouter();

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
  const [attribution, setAttribution] = useState<DisplayAttribution>(
    initialData?.attribution ?? "anonymous",
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const honeypotRef = useRef<HTMLInputElement>(null);

  const isSuggestedCompany = company?.id.startsWith(PENDING_PREFIX) ?? false;

  // Load the per-company level ladder when the company changes. The selected
  // level is reset in handleCompanyChange, not here, so a saved draft keeps it.
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
    fetchLevels(company.id)
      .then((next) => {
        if (cancelled) return;
        setLevels(next);
        if (next.length === 0) setLevel(NA_LEVEL);
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

  const draftData = useMemo<Record<string, unknown>>(
    () => ({
      company: toCompanySelection(company),
      role: role ? { id: role.id, name: role.label } : null,
      level,
      outcome,
      month,
      attribution,
      // Carry rounds owned by the rounds screen so a basics save never drops them.
      rounds: initialData?.rounds ?? undefined,
    }),
    [company, role, level, outcome, month, attribution, initialData?.rounds],
  );
  const serialized = JSON.stringify(draftData);
  const lastSavedRef = useRef(serialized);

  // Debounced autosave; skips the state we last persisted.
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
        // Empty id = honeypot-dropped write; only adopt a real one.
        if (!draftId && res.id) {
          setDraftId(res.id);
          window.history.replaceState(null, "", routes.draft(res.id));
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

  async function handleContinue() {
    const companySelection = toCompanySelection(company);
    const parsed = submissionReadySchema.safeParse({
      company: companySelection,
      role: role ? { id: role.id, name: role.label } : null,
      level,
      outcome,
      month,
      attribution,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "company" || key === "role" || key === "level" || key === "month") {
          next[key] ??= t(`errors.${key}`);
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);

    // Promote a fresh "suggest new" company to a pending taxonomy row and
    // backfill its id. suggestCompany is idempotent, so re-running is safe.
    let companyOption = company;
    if (companySelection?.kind === "suggested") {
      try {
        const created = await suggestPendingCompany({
          name: companySelection.name,
          honeypot: honeypotRef.current?.value ?? "",
        });
        if (created) {
          companyOption = { id: created.id, label: created.name };
          setCompany(companyOption);
        }
      } catch {
        setSubmitting(false);
        setSaveState("error");
        return;
      }
    }

    // Persist synchronously so rounds can resume by id (autosave may not have fired).
    try {
      const res = await saveDraft({
        id: draftId,
        data: {
          company: toCompanySelection(companyOption),
          role: role ? { id: role.id, name: role.label } : null,
          level,
          outcome,
          month,
          attribution,
          rounds: initialData?.rounds ?? undefined,
        },
        honeypot: honeypotRef.current?.value ?? "",
      });
      const id = res.id || draftId;
      if (id) {
        router.push(routes.submitRounds(id));
        return;
      }
    } catch {
      setSubmitting(false);
      setSaveState("error");
      return;
    }
    router.push(routes.submitRounds());
  }

  return (
    <div className={styles.form}>
      <FtlHoneypot ref={honeypotRef} />

      <FtlCombobox
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

      <FtlCombobox
        label={t("role.label")}
        placeholder={t("role.placeholder")}
        value={role}
        onChange={setRole}
        search={searchRoles}
        emptyMessage={t("role.empty")}
        required
      />
      {errors.role && <p className={styles.error}>{errors.role}</p>}

      <LevelField
        t={t}
        company={company}
        levels={levels}
        levelsLoading={levelsLoading}
        level={level}
        error={errors.level}
        onSelect={handleLevelSelect}
      />
      <FtlChoiceChips
        legend={t("outcome.legend")}
        name="outcome"
        options={REPORT_OUTCOMES}
        value={outcome}
        onChange={setOutcome}
        renderOption={(o) => t(`outcome.${o}`)}
        onClear={() => setOutcome(null)}
        clearLabel={t("outcome.clear")}
      />

      <FtlField label={t("month.label")} required error={errors.month}>
        {(id) => (
          <FtlInput
            id={id}
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value)}
          />
        )}
      </FtlField>

      <FtlChoiceChips
        legend={t("attribution.legend")}
        name="attribution"
        options={DISPLAY_ATTRIBUTIONS}
        value={attribution}
        onChange={setAttribution}
        renderOption={(a) => t(`attribution.${a}`)}
        hint={
          <FtlBody size="small" tone="muted" style={{ marginTop: 8 }}>
            {t("attribution.note")}
          </FtlBody>
        }
      />

      <div className={styles.actions}>
        <FtlButton
          variant="primary"
          trailingArrow
          onClick={() => void handleContinue()}
          disabled={submitting}
        >
          {t("continue")}
        </FtlButton>
        <span className={styles.saveState} aria-live="polite">
          {saveState === "saving" && t("save.saving")}
          {saveState === "saved" && t("save.saved")}
          {saveState === "error" && t("save.error")}
        </span>
      </div>
    </div>
  );
}
