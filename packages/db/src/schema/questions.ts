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

// `questions` — ordered children of rounds. The atom of the data model:
// one row = one interview question someone was asked.
//
// Topics: many-to-many with the `topics` taxonomy via the
// `question_topics` join table. PLAN.md §Data model says each question
// must have ≥1 topic, but Postgres alone can't enforce "row in this join
// table" — that's an application-level invariant we'll assert in the
// submission form's Zod validator (Sprint 1).
//
// Why no individual /questions/[id] page (PLAN.md §URL structure):
//   "No individual question pages in V1 (thin-content risk); topic pages
//    aggregate questions." So questions are only ever rendered inside a
//   report or a topic-aggregated list — never as a standalone canonical
//   URL. Schema doesn't enforce this; routing does.
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
