// Dummy comment fixtures hanging a rich thread (every comment shape the renderer
// handles: quotes, replies, edits, deleted/hidden placeholders, likes) off a
// seeded report. Idempotent; attaches to existing reports (run db:seed:reports first).

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";
import {
  commentLikes,
  comments,
  interviewReports,
  users,
} from "../schema/index.js";
import { SEED_AUTHORS } from "./reports.js";

type Db = PostgresJsDatabase<typeof schema>;

const REF = Date.UTC(2026, 4, 20); // fixed ref for reproducibility
const daysAgo = (n: number): Date => new Date(REF - n * 24 * 60 * 60 * 1000);

interface CommentSpec {
  key: string;
  author: string; // user id
  body: string;
  attribution: "display_name" | "anonymous";
  status?: "active" | "deleted" | "hidden";
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  quotedQuestionId?: string;
  quotedText?: string;
  replyToKey?: string;
  likes?: number;
}

export interface SeedCommentsResult {
  reports: number;
  comments: number;
  likes: number;
  mainReportId: string; // carries the rich thread; the runner prints its URL
}

export async function seedComments(db: Db): Promise<SeedCommentsResult> {
  // Resolve the ≥8 seed authors, keyed by clerk_id.
  const authorRows = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(inArray(users.clerkId, SEED_AUTHORS.map((a) => a.clerkId)));
  const byClerk = new Map(authorRows.map((r) => [r.clerkId, r.id]));
  const A = SEED_AUTHORS.map((a) => byClerk.get(a.clerkId)).filter(
    (x): x is string => Boolean(x),
  );
  if (A.length < 8) {
    throw new Error(
      "seed:comments — fewer than 8 seed authors found. Run `pnpm db:seed:reports` first.",
    );
  }

  // Three most-recent reports: the first gets the rich thread, the rest plain comments.
  const reportRows = await db
    .select({ id: interviewReports.id })
    .from(interviewReports)
    .where(
      and(
        eq(interviewReports.source, "seed_dummy"),
        eq(interviewReports.status, "active"),
      ),
    )
    .orderBy(desc(interviewReports.createdAt))
    .limit(3);
  if (reportRows.length === 0) {
    throw new Error(
      "seed:comments — no active seed_dummy reports. Run `pnpm db:seed:reports` first.",
    );
  }
  const ids = reportRows.map((r) => r.id);
  const main = ids[0]!; // guaranteed by the length check above
  const second = ids[1];
  const third = ids[2];

  // A real question on the main report, to quote.
  const qRows = await db.execute<{ id: string; question_prose: string }>(sql`
    SELECT q.id, q.question_prose
      FROM questions q
      JOIN rounds rd ON rd.id = q.round_id
     WHERE rd.report_id = ${main}::uuid
     ORDER BY rd.order_index, q.order_index
     LIMIT 1
  `);
  const quoted = qRows[0] ?? null;

  // Idempotency: clear comments on every seed_dummy report (likes CASCADE).
  await db.execute(sql`
    DELETE FROM comments
     WHERE report_id IN (
       SELECT id FROM interview_reports WHERE source = 'seed_dummy'
     )
  `);

  // The thread on the main report. A reply's parent must precede it (replyToKey).
  const specs: CommentSpec[] = [
    {
      key: "root1",
      author: A[0]!,
      body: "How long did the whole loop take end to end? Trying to plan PTO around it.",
      attribution: "display_name",
      createdAt: daysAgo(10),
      likes: 3,
    },
    {
      key: "reply1",
      author: A[3]!,
      body: "Mine was about three weeks from the recruiter screen to the offer call.",
      attribution: "display_name",
      createdAt: daysAgo(9),
      replyToKey: "root1",
      likes: 1,
    },
    ...(quoted
      ? [
          {
            key: "quote",
            author: A[2]!,
            body: "This exact one came up for me too — they pushed hard on the scaling follow-up, so have a number in mind before you start.",
            attribution: "anonymous" as const,
            createdAt: daysAgo(8),
            quotedQuestionId: quoted.id,
            quotedText: quoted.question_prose,
            likes: 5,
          },
        ]
      : []),
    {
      key: "edited",
      author: A[4]!,
      body: "Pro tip: ask the recruiter for the rubric up front — they actually shared it with me, which made the design round way less of a guessing game.",
      attribution: "display_name",
      createdAt: daysAgo(7),
      editedAt: daysAgo(6),
      likes: 2,
    },
    {
      key: "long",
      author: A[5]!,
      body:
        "I wrote up a full breakdown of every round here: https://example.com/loop-notes — timings, the exact prompts (paraphrased), and what I'd do differently. The system-design round was the make-or-break one; budget your time so you still have ten minutes for failure modes and back-of-envelope capacity math, because that's where they spend the back half of the interview.",
      attribution: "anonymous",
      createdAt: daysAgo(6),
      likes: 8,
    },
    {
      key: "deletedParent",
      author: A[6]!,
      body: "Deleting this — posted on the wrong report by mistake.",
      attribution: "display_name",
      status: "deleted",
      createdAt: daysAgo(5),
      deletedAt: daysAgo(5),
    },
    {
      key: "replyToDeleted",
      author: A[7]!,
      body: "Seconding the point above about prepping behavioral stories — they went deep on mine.",
      attribution: "display_name",
      createdAt: daysAgo(4),
      replyToKey: "deletedParent",
      likes: 1,
    },
    {
      key: "hiddenParent",
      author: A[1]!,
      body: "[removed by a moderator]",
      attribution: "anonymous",
      status: "hidden",
      createdAt: daysAgo(3),
    },
    {
      key: "replyToHidden",
      author: A[0]!,
      body: "Whatever the removed comment said, the coding round was a standard LC-medium for me — nothing exotic.",
      attribution: "anonymous",
      createdAt: daysAgo(2),
      replyToKey: "hiddenParent",
      likes: 2,
    },
    {
      key: "plainAnon",
      author: A[3]!,
      body: "Anyone have a sense of the comp range at this level? Trying to calibrate expectations.",
      attribution: "anonymous",
      createdAt: daysAgo(1),
    },
  ];

  // Plain comments on the other two reports, for badge counts.
  if (second) {
    specs.push(
      {
        key: "s1",
        author: A[2]!,
        body: "Clean writeup, thanks for sharing. Did they let you use your own editor?",
        attribution: "display_name",
        createdAt: daysAgo(4),
        likes: 1,
      },
      {
        key: "s2",
        author: A[5]!,
        body: "Same level here last quarter — outcome matched yours. The bar felt consistent.",
        attribution: "anonymous",
        createdAt: daysAgo(3),
      },
    );
  }
  if (third) {
    specs.push({
      key: "t1",
      author: A[6]!,
      body: "Helpful — the round-by-round sentiment is exactly what I was looking for.",
      attribution: "display_name",
      createdAt: daysAgo(2),
      likes: 4,
    });
  }

  const reportFor = (key: string): string => {
    if ((key === "s1" || key === "s2") && second) return second;
    if (key === "t1" && third) return third;
    return main;
  };

  // Insert in order, wiring replies + likes.
  const idByKey = new Map<string, string>();
  let commentCount = 0;
  let likeCount = 0;

  for (const s of specs) {
    const replyToCommentId = s.replyToKey
      ? (idByKey.get(s.replyToKey) ?? null)
      : null;
    const inserted = await db
      .insert(comments)
      .values({
        reportId: reportFor(s.key),
        authorUserId: s.author,
        body: s.body,
        displayAttribution: s.attribution,
        status: s.status ?? "active",
        quotedQuestionId: s.quotedQuestionId ?? null,
        quotedText: s.quotedText ?? null,
        replyToCommentId,
        editedAt: s.editedAt ?? null,
        deletedAt: s.deletedAt ?? null,
        createdAt: s.createdAt,
      })
      .returning({ id: comments.id });
    const id = inserted[0]!.id;
    idByKey.set(s.key, id);
    commentCount++;

    // Likes from distinct users other than the author (no self-like).
    if (s.likes && s.likes > 0) {
      const likers = A.filter((u) => u !== s.author).slice(0, s.likes);
      if (likers.length > 0) {
        await db.insert(commentLikes).values(
          likers.map((userId) => ({ commentId: id, userId })),
        );
        likeCount += likers.length;
      }
    }
  }

  return {
    reports: reportRows.length,
    comments: commentCount,
    likes: likeCount,
    mainReportId: main,
  };
}
