import type { CompanySelection, LevelSelection } from "@fromtheloop/shared";
import type { ComboboxOption } from "@/components/ui";
import type { LevelOption, LevelTier } from "./types";

export const PENDING_PREFIX = "pending:";
export const AUTOSAVE_DELAY_MS = 2000;
export const NA_LEVEL: LevelSelection = { id: null, name: "N/A" };

// Seniority prefix a tier prepends to the role in the level dropdown. `mid` is
// the baseline IC tier (no prefix); null tiers also get no prefix.
const LEVEL_TIER_PREFIX: Record<LevelTier, string> = {
  junior: "Junior ",
  mid: "",
  senior: "Senior ",
  staff: "Staff ",
  senior_staff: "Senior Staff ",
  principal: "Principal ",
};

// Render a level as the candidate-facing dropdown label. We keep storing the
// raw company level (level.name, e.g. "E5"); this is purely cosmetic. With a
// role + a known tier it reads "Senior Frontend Engineer (E5)"; without a role
// yet it falls back to the bare level name.
export function levelOptionLabel(
  level: Pick<LevelOption, "name" | "tier">,
  roleName: string | null,
): string {
  if (!roleName) return level.name;
  const prefix = level.tier ? LEVEL_TIER_PREFIX[level.tier] : "";
  return `${prefix}${roleName} (${level.name})`;
}

// "YYYY-MM" for <input type="month">.
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// A "pending:" id marks a suggest-new company with no row yet (the submit
// action creates it later).
export function toCompanySelection(
  option: ComboboxOption | null,
): CompanySelection | null {
  if (!option) return null;
  if (option.id.startsWith(PENDING_PREFIX)) {
    return { kind: "suggested", name: option.label };
  }
  return { kind: "existing", id: option.id, name: option.label };
}

export function companySelectionToOption(
  c: CompanySelection | null | undefined,
): ComboboxOption | null {
  if (!c) return null;
  // No hint: a restored selection only renders its label in the input.
  if (c.kind === "suggested") {
    return { id: `${PENDING_PREFIX}${c.name}`, label: c.name };
  }
  return { id: c.id, label: c.name };
}
