// Schema barrel — drizzle-kit reads this to discover tables + enums, so new
// schema modules must be re-exported here or migrations won't include them.

export * from "./enums.js";
export * from "./users.js";
export * from "./taxonomy.js";
export * from "./drafts.js";
export * from "./reports.js";
export * from "./rounds.js";
export * from "./questions.js";
export * from "./verifications.js";
export * from "./helpful-flags.js";
// Comments must precede likes (comment_likes FKs comments) — ADR-0011.
export * from "./comments.js";
export * from "./likes.js";
export * from "./content-flags.js";
export * from "./moderation.js";
export * from "./blocklist.js";
export * from "./events.js";
export * from "./analytics.js";
