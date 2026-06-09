// Event outbox + the aggregate consumer's per-event handler (Sprint 3 Day 3–4).
//
// Covers the transactional-outbox guarantees that matter at the DB layer:
// every report write emits the right event(s) in its own transaction, an edit
// that moves cells emits for both, and refreshAggregateForEvent drains an event
// idempotently and lands the aggregate. The BullMQ/LISTEN transport on top is
// worker wiring (typecheck/build-verified, not unit-tested here).

import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import {
  claimUnprocessedAggregateEvents,
  claimUnprocessedKarmaEvents,
  countUnprocessedAggregateEvents,
  countUnprocessedKarmaEvents,
  createReport,
  getAggregate,
  getOrCreateUserByClerkId,
  markKarmaEventProcessed,
  refreshAggregateForEvent,
  type ReportWriteInput,
  softDeleteReport,
  updateReport,
} from "../src/index.js";
import {
  companies,
  companyLevels,
  events,
  interviewReports,
  roles,
  topics,
} from "../src/schema/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const OWNER_CLERK = "clerk_events_owner";

describe("event outbox + aggregate consumer", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ownerId: string;
  let companyId: string;
  let roleId: string;
  let l5Id: string;
  let l6Id: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;
    companyId = (
      await db
        .insert(companies)
        .values({ slug: "evco", name: "EvCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    l5Id = (
      await db
        .insert(companyLevels)
        .values({ companyId, slug: "el5", name: "L5", orderIndex: 0 })
        .returning({ id: companyLevels.id })
    )[0]!.id;
    l6Id = (
      await db
        .insert(companyLevels)
        .values({ companyId, slug: "el6", name: "L6", orderIndex: 1 })
        .returning({ id: companyLevels.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "evswe", name: "Ev SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "ev-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db.delete(events);
    await db.delete(interviewReports).where(eq(interviewReports.createdByUserId, ownerId));
    await db.delete(companyLevels).where(eq(companyLevels.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(topics).where(eq(topics.id, topicId));
    await close();
  });

  beforeEach(async () => {
    // events has no FK to reports, so clear both explicitly.
    await db.delete(events);
    await db.delete(interviewReports);
  });

  function input(level: string, levelId: string): ReportWriteInput {
    return {
      createdByUserId: ownerId,
      companyId,
      canonicalRoleId: roleId,
      level,
      levelId,
      interviewMonth: "2026-05",
      outcome: "offer",
      displayAttribution: "anonymous",
      status: "active",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: null,
          questions: [{ prose: "q", topicIds: [topicId] }],
        },
      ],
    };
  }

  it("emits a 'created' event naming the report's cell, unprocessed", async () => {
    const { id } = await createReport(db, input("L5", l5Id));
    const pending = await claimUnprocessedAggregateEvents(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      op: "created",
      reportId: id,
      companyId,
      canonicalRoleId: roleId,
      level: "L5",
      aggregateProcessedAt: null,
    });
  });

  it("emits a 'deleted' event on soft delete", async () => {
    const { id } = await createReport(db, input("L5", l5Id));
    await db.delete(events); // ignore the create event for this assertion
    await softDeleteReport(db, id, ownerId);
    const pending = await claimUnprocessedAggregateEvents(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ op: "deleted", reportId: id, level: "L5" });
  });

  it("emits for BOTH cells when an edit moves the report", async () => {
    const { id } = await createReport(db, input("L5", l5Id));
    await db.delete(events); // ignore the create event
    await updateReport(db, id, ownerId, input("L6", l6Id));
    const pending = await claimUnprocessedAggregateEvents(db);
    const levels = pending.map((e) => e.level).sort();
    expect(levels).toEqual(["L5", "L6"]); // vacated old cell + new cell
    expect(pending.every((e) => e.op === "updated")).toBe(true);
  });

  it("emits a single event for an in-place edit (cell unchanged)", async () => {
    const { id } = await createReport(db, input("L5", l5Id));
    await db.delete(events);
    await updateReport(db, id, ownerId, input("L5", l5Id));
    const pending = await claimUnprocessedAggregateEvents(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.level).toBe("L5");
  });

  it("drains an event: refreshes its cell + marks it processed (idempotent)", async () => {
    await createReport(db, input("L5", l5Id));
    const [event] = await claimUnprocessedAggregateEvents(db);
    expect(event).toBeDefined();

    const r1 = await refreshAggregateForEvent(db, event!.id);
    expect(r1).toBe("refreshed");

    const cell = { companyId, canonicalRoleId: roleId, level: "L5" } satisfies {
      companyId: string;
      canonicalRoleId: string;
      level: string;
    };
    const agg = await getAggregate(db, cell);
    expect(agg!.reportCount).toBe(1);

    // marked processed → no longer pending, lag is zero.
    expect(await claimUnprocessedAggregateEvents(db)).toHaveLength(0);
    expect(await countUnprocessedAggregateEvents(db)).toBe(0);

    // re-draining the same id is a harmless no-op.
    expect(await refreshAggregateForEvent(db, event!.id)).toBe("refreshed");
  });

  it("fires a NOTIFY on the 'events' channel carrying the new event id", async () => {
    // A dedicated LISTEN connection (postgres.js reserves it) against the same
    // testcontainer. This verifies migration 0010's trigger end-to-end.
    const listener = postgres(inject("databaseUrl"), {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    const received: string[] = [];
    await listener.listen("events", (payload) => received.push(payload));

    try {
      await createReport(db, input("L5", l5Id));
      const [event] = await claimUnprocessedAggregateEvents(db);
      expect(event).toBeDefined();
      // Poll briefly — the notification is delivered async after commit. Assert
      // the id is among received (other test files may share the container).
      const deadline = Date.now() + 2000;
      while (!received.includes(event!.id) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(received).toContain(event!.id);
    } finally {
      await listener.end({ timeout: 5 });
    }
  });

  it("the karma consumer drains the same log on an independent marker", async () => {
    await createReport(db, input("L5", l5Id));
    // One event, pending for ALL consumers at first.
    const pendingKarma = await claimUnprocessedKarmaEvents(db);
    expect(pendingKarma).toHaveLength(1);
    expect(pendingKarma[0]!.karmaProcessedAt).toBeNull();
    expect(await countUnprocessedKarmaEvents(db)).toBe(1);

    const eventId = pendingKarma[0]!.id;
    expect(await markKarmaEventProcessed(db, eventId)).toBe(true);

    // Karma marker flipped → no longer pending for karma, lag zero.
    expect(await claimUnprocessedKarmaEvents(db)).toHaveLength(0);
    expect(await countUnprocessedKarmaEvents(db)).toBe(0);
    // A second mark is a harmless no-op (guarded on still-null).
    expect(await markKarmaEventProcessed(db, eventId)).toBe(false);

    // The aggregate consumer is untouched — markers are independent.
    expect(await claimUnprocessedAggregateEvents(db)).toHaveLength(1);
    expect(await countUnprocessedAggregateEvents(db)).toBe(1);
  });

  it("treats a missing event id as a no-op", async () => {
    const r = await refreshAggregateForEvent(
      db,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(r).toBe("missing");
  });

  it("end-to-end: a deleted report's cell empties after its events drain", async () => {
    const { id } = await createReport(db, input("L5", l5Id));
    // drain the create event
    for (const e of await claimUnprocessedAggregateEvents(db)) {
      await refreshAggregateForEvent(db, e.id);
    }
    const cell = { companyId, canonicalRoleId: roleId, level: "L5" };
    expect((await getAggregate(db, cell))!.reportCount).toBe(1);

    await softDeleteReport(db, id, ownerId);
    for (const e of await claimUnprocessedAggregateEvents(db)) {
      await refreshAggregateForEvent(db, e.id);
    }
    // cell had only this report → row removed once the delete event drains.
    expect(await getAggregate(db, cell)).toBeNull();
    expect(await countUnprocessedAggregateEvents(db)).toBe(0);
  });
});
