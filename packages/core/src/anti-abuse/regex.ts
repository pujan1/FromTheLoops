// Submission content scanning — the regex block list.
//
// At finalize time we sweep every free-text field a user wrote (round
// experience prose + each question's prose) for two kinds of content:
//
//   - "block" severity → contact info and obvious PII (phone numbers, emails,
//     US SSNs). These have no place in an interview report and are
//     high-confidence patterns, so a match hard-rejects the submission (the
//     sprint's "Submitting 'call me at 555-1234' is rejected" criterion).
//
//   - "flag" severity → profanity. Sprint risk note: regexes over technical
//     prose false-positive easily ("the interviewer was an ass" is a candid,
//     legitimate review on a site whose whole value is candor), so we do NOT
//     hard-reject these. They're returned to the caller to log for moderation
//     review and tune later (Sprint 6 mod tooling). Identity slurs belong in
//     this list at "block" severity, but that curated word list is maintained
//     operationally and deliberately kept out of source history.
//
// Patterns are intentionally tight: they match contact-info *shapes* (digit
// runs, @-addresses), never the mere words "phone"/"email", so ordinary
// technical writing passes clean.

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

// Each `re` is tested with .test(); none use the global flag (we only care
// whether a match exists, and a stateful lastIndex would make .test() flaky
// across calls).
const PATTERN_RULES: PatternRule[] = [
  // Email address.
  {
    category: "contact_info",
    severity: "block",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  },
  // 10-digit (optionally +1-prefixed) North-American phone, common separators.
  {
    category: "contact_info",
    severity: "block",
    re: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
  },
  // Bare 7-digit local number ("555-1234"): three digits, a separator, four
  // digits. The separator is required so plain integers in prose don't match.
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

// Profanity word list (flag-only). Whole-word, case-insensitive. Common
// profanity, not identity slurs — the latter are added operationally at
// "block" severity. Kept short on purpose; this is a tuning surface, not a
// comprehensive filter.
const PROFANITY_WORDS = ["fuck", "shit", "asshole", "bitch", "bastard"];
const PROFANITY_RE = new RegExp(`\\b(?:${PROFANITY_WORDS.join("|")})\\b`, "i");

// Scan a single string. Returns every distinct (category, severity) it matched
// — at most one entry per category, since the caller only needs to know which
// kinds of content are present, not how many times.
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

// Scan many strings (a report's free-text fields), deduping to at most one
// match per category across the whole set.
export function scanTexts(texts: readonly string[]): ContentMatch[] {
  const byCategory = new Map<ContentCategory, ContentMatch>();
  for (const text of texts) {
    for (const match of scanText(text)) {
      if (!byCategory.has(match.category)) byCategory.set(match.category, match);
    }
  }
  return [...byCategory.values()];
}

// Convenience: the first block-severity match in a set of texts, or null if
// none. This is the finalize gate — a non-null result hard-rejects.
export function firstBlockingMatch(
  texts: readonly string[],
): ContentMatch | null {
  return scanTexts(texts).find((m) => m.severity === "block") ?? null;
}
