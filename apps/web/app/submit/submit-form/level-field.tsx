"use client";

import type { LevelSelection } from "@fromtheloop/shared";
import type { useTranslations } from "next-intl";
import { type ComboboxOption, FtlField, FtlSelect } from "@/components/ui";
import styles from "../submit.module.css";
import { levelOptionLabel } from "./helpers";
import type { LevelOption } from "./types";

// Per-company level ladder, or N/A when the company has none. Optional: a
// candidate may interview before the level is decided, so the dropdown leads
// with a skip option. Each rung renders as "{seniority} {role} ({level})".
export function LevelField(props: {
  t: ReturnType<typeof useTranslations>;
  company: ComboboxOption | null;
  roleName: string | null;
  levels: LevelOption[];
  levelsLoading: boolean;
  level: LevelSelection | null;
  error?: string;
  onSelect: (value: string) => void;
}) {
  const { t, company, roleName, levels, levelsLoading, level, error, onSelect } =
    props;
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
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">{t("level.skip")}</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {levelOptionLabel(l, roleName)}
              </option>
            ))}
          </FtlSelect>
        ) : (
          <p className={styles.hint}>
            {t.rich("level.na", { strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
        )
      }
    </FtlField>
  );
}
