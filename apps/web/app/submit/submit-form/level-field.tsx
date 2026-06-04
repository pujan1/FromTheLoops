"use client";

import type { LevelSelection } from "@fromtheloop/shared";
import type { useTranslations } from "next-intl";
import { useState } from "react";
import {
  type ComboboxOption,
  FtlField,
  FtlInput,
  FtlSelect,
} from "@/components/ui";
import styles from "../submit.module.css";
import {
  CUSTOM_LEVEL_KEY,
  isCustomSeniorityLevel,
  levelOptionLabel,
  SENIORITY_RUNGS,
  seniorityRungLabel,
} from "./helpers";
import type { LevelOption } from "./types";

// Level field. Three shapes depending on what we know about the company:
//   - the company's own ladder, when it has one ("E5" rungs, role-labelled);
//   - a synthetic seniority ladder ("Senior Frontend Engineer", …) when the
//     company has no ladder of its own (a brand-new suggestion, or an existing
//     company with an empty ladder) — plus an "Other…" rung for a custom title;
//   - hints, while we're still missing the company or the role.
// Level is optional throughout, so every variant leads with a skip option.
export function LevelField(props: {
  t: ReturnType<typeof useTranslations>;
  company: ComboboxOption | null;
  roleName: string | null;
  levels: LevelOption[];
  levelsLoading: boolean;
  level: LevelSelection | null;
  error?: string;
  onChange: (level: LevelSelection | null) => void;
}) {
  const { t, company, roleName, levels, levelsLoading, level, error, onChange } =
    props;

  // Custom mode latches when the user picks "Other…" (so the input stays open
  // even before they've typed). A rehydrated custom value opens it implicitly.
  const [customMode, setCustomMode] = useState(false);
  const showCustom = customMode || isCustomSeniorityLevel(level);

  function handleLadderSelect(value: string) {
    if (value === "") {
      onChange(null);
      return;
    }
    const match = levels.find((l) => l.id === value);
    if (match) onChange({ id: match.id, name: match.name });
  }

  function handleSenioritySelect(value: string) {
    if (value === CUSTOM_LEVEL_KEY) {
      setCustomMode(true);
      // Drop any non-custom rung selection; keep an existing custom value so
      // re-opening the input doesn't wipe what was typed.
      if (!isCustomSeniorityLevel(level)) onChange(null);
      return;
    }
    setCustomMode(false);
    if (value === "") {
      onChange(null);
      return;
    }
    const rung = SENIORITY_RUNGS.find((r) => r.key === value);
    if (rung) onChange({ id: null, name: rung.name });
  }

  const seniorityValue = showCustom
    ? CUSTOM_LEVEL_KEY
    : (SENIORITY_RUNGS.find((r) => r.name === level?.name)?.key ?? "");
  const customValue = isCustomSeniorityLevel(level) ? (level?.name ?? "") : "";

  return (
    <FtlField label={t("level.label")} error={error}>
      {(id) =>
        !company ? (
          <p className={styles.hint}>{t("level.chooseCompany")}</p>
        ) : levelsLoading ? (
          <p className={styles.hint}>{t("level.loading")}</p>
        ) : levels.length > 0 ? (
          <FtlSelect
            id={id}
            value={level?.id ?? ""}
            onChange={(e) => handleLadderSelect(e.target.value)}
          >
            <option value="">{t("level.skip")}</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {levelOptionLabel(l, roleName)}
              </option>
            ))}
          </FtlSelect>
        ) : !roleName ? (
          <p className={styles.hint}>{t("level.chooseRole")}</p>
        ) : (
          <>
            <FtlSelect
              id={id}
              value={seniorityValue}
              onChange={(e) => handleSenioritySelect(e.target.value)}
            >
              <option value="">{t("level.skip")}</option>
              {SENIORITY_RUNGS.map((rung) => (
                <option key={rung.key} value={rung.key}>
                  {seniorityRungLabel(rung, roleName)}
                </option>
              ))}
              <option value={CUSTOM_LEVEL_KEY}>{t("level.custom")}</option>
            </FtlSelect>
            {showCustom && (
              <FtlInput
                aria-label={t("level.customLabel")}
                placeholder={t("level.customPlaceholder")}
                value={customValue}
                maxLength={80}
                onChange={(e) =>
                  onChange(
                    e.target.value.trim()
                      ? { id: null, name: e.target.value }
                      : null,
                  )
                }
                style={{ marginTop: 8 }}
              />
            )}
          </>
        )
      }
    </FtlField>
  );
}
