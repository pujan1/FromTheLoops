import type { CompanySelection, LevelSelection } from "@fromtheloop/shared";
import type { ComboboxOption } from "@/components/ui";

export const PENDING_PREFIX = "pending:";
export const AUTOSAVE_DELAY_MS = 2000;
export const NA_LEVEL: LevelSelection = { id: null, name: "N/A" };

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
