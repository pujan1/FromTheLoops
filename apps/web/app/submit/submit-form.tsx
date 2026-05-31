"use client";

// Top-level submission fields (Sprint 1 Day 5). Client component: holds
// form state, drives the two taxonomy Comboboxes off the /api/taxonomy
// lookups, validates with the shared Zod schema, and routes to the Rounds
// stub on success. Draft autosave/resume is wired in Day 6 — for now state
// is in-memory only.

import {
  attributionSchema,
  type CompanySelection,
  DISPLAY_ATTRIBUTIONS,
  type LevelSelection,
  REPORT_OUTCOMES,
  type ReportOutcome,
  submissionReadySchema,
} from "@fromtheloop/shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Body, Button, Combobox, type ComboboxOption } from "@/components/ui";
import styles from "./submit.module.css";

const PENDING_PREFIX = "pending:";

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

// Combobox option → schema selection. A "pending:" id marks a suggest-new
// company that has no row yet (the submit action creates it later).
function toCompanySelection(option: ComboboxOption | null): CompanySelection | null {
  if (!option) return null;
  if (option.id.startsWith(PENDING_PREFIX)) {
    return { kind: "suggested", name: option.label };
  }
  return { kind: "existing", id: option.id, name: option.label };
}

const NA_LEVEL: LevelSelection = { id: null, name: "N/A" };

type FieldErrors = Partial<
  Record<"company" | "role" | "level" | "month", string>
>;

export function SubmitForm() {
  const router = useRouter();
  const baseId = useId();

  const [company, setCompany] = useState<ComboboxOption | null>(null);
  const [role, setRole] = useState<ComboboxOption | null>(null);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [level, setLevel] = useState<LevelSelection | null>(null);
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);
  const [month, setMonth] = useState<string>(currentMonth);
  const [attribution, setAttribution] = useState<
    (typeof DISPLAY_ATTRIBUTIONS)[number]
  >("anonymous");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isSuggestedCompany = company?.id.startsWith(PENDING_PREFIX) ?? false;

  // Load the per-company level ladder whenever the company changes. A
  // suggested (not-yet-created) company has no levels → N/A.
  useEffect(() => {
    if (!company) {
      setLevels([]);
      setLevel(null);
      return;
    }
    if (isSuggestedCompany) {
      setLevels([]);
      setLevel(NA_LEVEL);
      return;
    }

    let cancelled = false;
    setLevelsLoading(true);
    setLevel(null);
    fetch(`/api/taxonomy/companies/${company.id}/levels`)
      .then((res) => (res.ok ? res.json() : { levels: [] }))
      .then((data: { levels: LevelOption[] }) => {
        if (cancelled) return;
        setLevels(data.levels);
        // No ladder on file → the company uses the N/A sentinel.
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
          next[key] ??= fieldMessage(key);
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    // Day 6 persists the draft here; for now go straight to the stub.
    router.push("/submit/rounds");
  }

  const hasLevelLadder = levels.length > 0;

  return (
    <div className={styles.form}>
      <Combobox
        label="Company"
        placeholder="Search companies…"
        value={company}
        onChange={setCompany}
        search={searchCompanies}
        onSuggestNew={(name) =>
          setCompany({
            id: `${PENDING_PREFIX}${name}`,
            label: name,
            hint: "new · pending review",
          })
        }
        required
      />
      {errors.company && <p className={styles.error}>{errors.company}</p>}

      <Combobox
        label="Role"
        placeholder="Search canonical roles…"
        value={role}
        onChange={setRole}
        search={searchRoles}
        emptyMessage="No matching role — pick the closest canonical title."
        required
      />
      {errors.role && <p className={styles.error}>{errors.role}</p>}

      {/* Level — per-company ladder, or N/A when the company has none. */}
      <div className={styles.field}>
        <label htmlFor={`${baseId}-level`} className={styles.label}>
          Level
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        </label>
        {!company ? (
          <p className={styles.hint}>Choose a company first.</p>
        ) : levelsLoading ? (
          <p className={styles.hint}>Loading levels…</p>
        ) : hasLevelLadder ? (
          <select
            id={`${baseId}-level`}
            className={styles.select}
            value={level?.id ?? ""}
            onChange={(e) => handleLevelSelect(e.target.value)}
          >
            <option value="">Select a level…</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : (
          <p className={styles.hint}>
            No level ladder on file for this company — recorded as{" "}
            <strong>N/A</strong>.
          </p>
        )}
        {errors.level && <p className={styles.error}>{errors.level}</p>}
      </div>

      {/* Outcome — optional. */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Outcome (optional)</legend>
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
              {o}
            </label>
          ))}
          {outcome && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setOutcome(null)}
            >
              clear
            </button>
          )}
        </div>
      </fieldset>

      {/* Interview month. */}
      <div className={styles.field}>
        <label htmlFor={`${baseId}-month`} className={styles.label}>
          Interview month
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
        <legend className={styles.label}>Attribution</legend>
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
              {a === "display_name" ? "Show my display name" : "Anonymous"}
            </label>
          ))}
        </div>
        <Body size="small" tone="muted" style={{ marginTop: 8 }}>
          Anonymous is the default. You can still verify a work email later
          without revealing your name.
        </Body>
      </fieldset>

      <div className={styles.actions}>
        <Button variant="primary" trailingArrow onClick={handleContinue} disabled={submitting}>
          Continue → Rounds
        </Button>
      </div>
    </div>
  );
}

function fieldMessage(key: "company" | "role" | "level" | "month"): string {
  switch (key) {
    case "company":
      return "Pick a company or suggest a new one.";
    case "role":
      return "Pick the closest canonical role.";
    case "level":
      return "Select a level.";
    case "month":
      return "Choose the interview month.";
  }
}
