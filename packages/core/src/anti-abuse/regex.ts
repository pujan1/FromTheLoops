// Free-text content scan at finalize. "block" (contact info / PII) hard-rejects;
// "flag" (profanity) is logged for moderation, never hard-rejected (candor is the
// product's value). Patterns match contact-info shapes, not the words.

export type ContentCategory = "contact_info" | "pii" | "profanity";
export type MatchSeverity = "block" | "flag";

export interface ContentMatch {
  category: ContentCategory;
  severity: MatchSeverity;
}

interface PatternRule {
  category: ContentCategory;
  severity: MatchSeverity;
  re: RegExp;
}

// None use the global flag (a stateful lastIndex would make .test() flaky).
const PATTERN_RULES: PatternRule[] = [
  // Email address.
  {
    category: "contact_info",
    severity: "block",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  },
  // North-American phone (optionally +1-prefixed).
  {
    category: "contact_info",
    severity: "block",
    re: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
  },
  // Bare 7-digit local number; separator required so plain integers don't match.
  {
    category: "contact_info",
    severity: "block",
    re: /\b\d{3}[\s.-]\d{4}\b/,
  },
  // US Social Security number.
  {
    category: "pii",
    severity: "block",
    re: /\b\d{3}-\d{2}-\d{4}\b/,
  },
];

// Flag-only profanity (not identity slurs, which are added operationally at "block").
const PROFANITY_WORDS = ["fuck", "shit", "asshole", "bitch", "bastard"];
const PROFANITY_RE = new RegExp(`\\b(?:${PROFANITY_WORDS.join("|")})\\b`, "i");

// At most one match per category.
export function scanText(text: string): ContentMatch[] {
  if (!text) return [];
  const matches: ContentMatch[] = [];
  const seen = new Set<ContentCategory>();

  for (const rule of PATTERN_RULES) {
    if (seen.has(rule.category)) continue;
    if (rule.re.test(text)) {
      matches.push({ category: rule.category, severity: rule.severity });
      seen.add(rule.category);
    }
  }
  if (PROFANITY_RE.test(text)) {
    matches.push({ category: "profanity", severity: "flag" });
  }
  return matches;
}

// Dedupes to at most one match per category across the whole set.
export function scanTexts(texts: readonly string[]): ContentMatch[] {
  const byCategory = new Map<ContentCategory, ContentMatch>();
  for (const text of texts) {
    for (const match of scanText(text)) {
      if (!byCategory.has(match.category)) byCategory.set(match.category, match);
    }
  }
  return [...byCategory.values()];
}

// The finalize gate — a non-null result hard-rejects.
export function firstBlockingMatch(
  texts: readonly string[],
): ContentMatch | null {
  return scanTexts(texts).find((m) => m.severity === "block") ?? null;
}
