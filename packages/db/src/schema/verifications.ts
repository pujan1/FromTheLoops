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

// "This user verified they worked at this company." Drives the
// evidence_verified badge. Stores only a hash of the evidence, never the raw
// value. CASCADE on user_id, RESTRICT on company_id (merges rewrite the FK).
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
