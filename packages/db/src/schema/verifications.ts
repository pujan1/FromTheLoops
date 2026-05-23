import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { verificationMethod } from "./enums.js";
import { companies } from "./taxonomy.js";
import { users } from "./users.js";

// `user_verifications` — "this user once worked at this company,
// verified by method X." Drives the `evidence_verified=true` badge on
// reports they later submit. See PLAN.md §Trust & verification — the
// 3-layer trust model.
//
// Privacy: we store *only* a hash of whatever evidence we received
// (work email, OAuth subject, manual reviewer note). Never the raw
// value. If we get subpoenaed we can prove a user verified against a
// given company; we can't reveal *what* email they used.
//
// Cascade: ON DELETE CASCADE on user_id — if a user is hard-deleted
// (GDPR right-to-erasure), their verifications go too. Tested in
// tests/constraints.test.ts.
//
// ON DELETE RESTRICT on company_id — same logic as reports: taxonomy
// merges must rewrite the FK, not silently drop verifications.
export const userVerifications = pgTable(
  "user_verifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    verifiedVia: verificationMethod("verified_via").notNull(),
    // hash of the evidence (work email, OAuth subject, etc) — never store
    // the raw value.
    evidenceTokenHash: text("evidence_token_hash").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("verifications_user_idx").on(t.userId),
    index("verifications_company_idx").on(t.companyId),
  ],
);

export type UserVerification = typeof userVerifications.$inferSelect;
export type NewUserVerification = typeof userVerifications.$inferInsert;
