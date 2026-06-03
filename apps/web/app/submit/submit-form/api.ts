// Taxonomy lookups backing the Comboboxes and the level ladder.

import type { ComboboxOption } from "@/components/ui";
import type { LevelOption } from "./types";

export async function searchCompanies(q: string): Promise<ComboboxOption[]> {
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

export async function searchRoles(q: string): Promise<ComboboxOption[]> {
  const res = await fetch(`/api/taxonomy/roles?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { matches: { id: string; name: string }[] };
  return data.matches.map((m) => ({ id: m.id, label: m.name }));
}

export async function fetchLevels(companyId: string): Promise<LevelOption[]> {
  const res = await fetch(`/api/taxonomy/companies/${companyId}/levels`);
  if (!res.ok) return [];
  const data = (await res.json()) as { levels: LevelOption[] };
  return data.levels;
}
