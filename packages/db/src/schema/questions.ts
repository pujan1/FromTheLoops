import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { rounds } from "./rounds.js";
import { topics } from "./taxonomy.js";

// Ordered children of rounds. Many-to-many with topics via question_topics;
// the ≥1-topic rule is enforced in the submission validator, not Postgres.
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    questionProse: text("question_prose").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("questions_round_idx").on(t.roundId),
    uniqueIndex("questions_round_order_uq").on(t.roundId, t.orderIndex),
  ],
);

export const questionTopics = pgTable(
  "question_topics",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.topicId] }),
    index("question_topics_topic_idx").on(t.topicId),
  ],
);

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type QuestionTopic = typeof questionTopics.$inferSelect;
