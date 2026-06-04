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
  FtlNotice,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { noticeToneForError, useActionStatus } from "@/lib/use-action-status";
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
import type { FieldErrors, LevelOption, SubmitFormProps } from "./types";

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
  const honeypotRef = useRef<HTMLInputElement>(null);

  // One hook per action: `save` drives both autosave and the Continue save;
  // `suggest` drives the pending-company promotion. Each owns its own
  // status/error so the save-state indicator and the failure notice derive from
  // them instead of a hand-rolled enum.
  const save = useActionStatus(saveDraft);
  const suggest = useActionStatus(suggestPendingCompany);
  const failure = save.error ?? suggest.error;

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

  // Month is optional: an empty <input type="month"> yields "", which isn't a
  // valid YYYY-MM. Coerce it to undefined so the draft/ready schemas (month is
  // nullish) accept it; the finalize gate fills in the current month.
  const monthValue = month || undefined;

  const draftData = useMemo<Record<string, unknown>>(
    () => ({
      company: toCompanySelection(company),
      role: role ? { id: role.id, name: role.label } : null,
      level,
      outcome,
      month: monthValue,
      attribution,
      // Carry rounds owned by the rounds screen so a basics save never drops them.
      rounds: initialData?.rounds ?? undefined,
      // Carry the edit target so a basics edit doesn't strip it (which would
      // turn an in-place edit into a brand-new report at finalize).
      editingReportId: initialData?.editingReportId ?? undefined,
    }),
    [
      company,
      role,
      level,
      outcome,
      monthValue,
      attribution,
      initialData?.rounds,
      initialData?.editingReportId,
    ],
  );
  const serialized = JSON.stringify(draftData);
  const lastSavedRef = useRef(serialized);

  // Debounced autosave; skips the state we last persisted. `save.run`
  // normalizes failures (rate limit, validation, a thrown fault) into the
  // hook's error, which the notice below renders — no try/catch here.
  const runSave = save.run;
  useEffect(() => {
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(async () => {
      const res = await runSave({
        id: draftId,
        data: draftData,
        honeypot: honeypotRef.current?.value ?? "",
      });
      if (!res.ok) return;
      lastSavedRef.current = serialized;
      // Empty id = honeypot-dropped write; only adopt a real one.
      if (!draftId && res.data.id) {
        setDraftId(res.data.id);
        window.history.replaceState(null, "", routes.draft(res.data.id));
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [serialized, draftId, draftData, runSave]);

  function handleCompanyChange(option: ComboboxOption | null) {
    setCompany(option);
    setLevel(null);
    // Drop any stale suggestion error — the chosen company just changed.
    suggest.reset();
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
      month: monthValue,
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
    // A failure surfaces via the notice (suggest.error); just stop here.
    let companyOption = company;
    if (companySelection?.kind === "suggested") {
      const res = await suggest.run({
        name: companySelection.name,
        honeypot: honeypotRef.current?.value ?? "",
      });
      if (!res.ok) {
        setSubmitting(false);
        return;
      }
      if (res.data) {
        companyOption = { id: res.data.id, label: res.data.name };
        setCompany(companyOption);
      }
    }

    // Persist synchronously so rounds can resume by id (autosave may not have fired).
    const res = await save.run({
      id: draftId,
      data: {
        company: toCompanySelection(companyOption),
        role: role ? { id: role.id, name: role.label } : null,
        level,
        outcome,
        month: monthValue,
        attribution,
        rounds: initialData?.rounds ?? undefined,
        editingReportId: initialData?.editingReportId ?? undefined,
      },
      honeypot: honeypotRef.current?.value ?? "",
    });
    if (!res.ok) {
      setSubmitting(false);
      return;
    }
    const id = res.data.id || draftId;
    router.push(id ? routes.submitRounds(id) : routes.submitRounds());
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
        roleName={role?.label ?? null}
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

      <FtlField label={t("month.label")} error={errors.month}>
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
          {save.isPending && t("save.saving")}
          {save.isSuccess && t("save.saved")}
        </span>
      </div>

      {failure && (
        <FtlNotice tone={noticeToneForError(failure)} title={t("save.error")}>
          {failure.message}
        </FtlNotice>
      )}
    </div>
  );
}
