// Schema barrel. drizzle-kit reads *this* file (per drizzle.config.ts)
// to discover every table + enum, so any new schema module must be
// re-exported here or migrations won't include it.
//
// Order is intentional: enums before tables that use them, parents
// before children. Drizzle doesn't strictly require this (it resolves
// graph order itself), but the file order makes the dependency story
// readable top-to-bottom.

export * from "./enums.js";
export * from "./users.js";
export * from "./taxonomy.js";
export * from "./reports.js";
export * from "./rounds.js";
export * from "./questions.js";
export * from "./verifications.js";
export * from "./moderation.js";
