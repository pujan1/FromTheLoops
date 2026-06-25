// Slug derivation shared by the curated seed (level slugs) and taxonomy
// suggest-pending logic (company slugs). Lowercase, collapse any run of
// non-alphanumerics to a single hyphen, trim leading/trailing hyphens.
//
// Not globally unique by construction — callers rely on a DB unique
// constraint (company_levels.(company_id, slug), companies.slug) to reject
// or de-dupe collisions.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
