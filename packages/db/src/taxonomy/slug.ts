// Lowercase, runs of non-alphanumerics → single hyphen, trim hyphens. Not
// unique by construction — callers rely on DB unique constraints.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
