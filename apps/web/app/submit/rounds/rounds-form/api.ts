// Topic-tag autocomplete backing the per-question TagPicker. Mirrors the
// basics form's taxonomy lookups (submit-form/api.ts). Returns the full match
// (id + slug + name) — the picker needs the slug to build an "existing" tag
// selection, not just the combobox's id/label.

export interface TopicMatch {
  id: string;
  slug: string;
  name: string;
}

export async function searchTopics(q: string): Promise<TopicMatch[]> {
  const res = await fetch(`/api/taxonomy/topics?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { matches: TopicMatch[] };
  return data.matches;
}
