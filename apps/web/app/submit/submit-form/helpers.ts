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

// Synthetic seniority ladder offered when a company has no level row of its own
// — a brand-new "suggested" company, or an existing one with an empty ladder.
// The dropdown label reads as a full title ("Senior Frontend Engineer") so it's
// legible while choosing, but the stored level.name is just the bare seniority
// (`name`), since there's no company level row to point at (id stays null).
// Order: baseline first, then the common IC ladder, then the entry rungs.
export const SENIORITY_RUNGS = [
  { key: "mid", name: "Mid-level", prefix: "" },
  { key: "senior", name: "Senior", prefix: "Senior " },
  { key: "staff", name: "Staff", prefix: "Staff " },
  { key: "principal", name: "Principal", prefix: "Principal " },
  { key: "senior_staff", name: "Senior Staff", prefix: "Senior Staff " },
  { key: "senior_principal", name: "Senior Principal", prefix: "Senior Principal " },
  { key: "junior", name: "Junior", prefix: "Junior " },
  { key: "intern", name: "Intern", prefix: "Intern " },
  { key: "associate", name: "Associate", prefix: "Associate " },
] as const;

// Sentinel select value for the "Other… (type your own)" rung, which reveals a
// free-text input. Distinct from "" (skip) and any real rung key.
export const CUSTOM_LEVEL_KEY = "__custom__";

// Dropdown label for a synthetic rung: "{prefix}{role}", e.g. "Staff Frontend
// Engineer". The baseline rung has no prefix, so it's just the role.
export function seniorityRungLabel(
  rung: { prefix: string },
  roleName: string,
): string {
  return `${rung.prefix}${roleName}`;
}

// True when `level` is a custom/free-text value — set, non-N/A, and not one of
// the canonical seniority rungs. Drives whether the synthetic dropdown opens in
// custom mode (e.g. when a saved draft is rehydrated).
export function isCustomSeniorityLevel(level: LevelSelection | null): boolean {
  if (!level) return false;
  if (level.name === NA_LEVEL.name) return false;
  return !SENIORITY_RUNGS.some((r) => r.name === level.name);
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
