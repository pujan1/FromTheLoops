"use client";

// Styleguide demo of <ModQueue> (Sprint 6 Day 2). Mock data + a simulated
// server action so the component's interactions — filter, bulk select, reason
// prompt, optimistic row removal — can be exercised without a live queue. The
// real queue pages (Day 3+) supply DB-backed items and a real server action.

import { ModQueue } from "../admin/_components/mod-queue";
import {
  QUEUE_CONFIGS,
  type ModQueueItem,
  type QueueActionFn,
} from "../admin/queues/queue-config";

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();

const MOCK_ITEMS: ModQueueItem[] = [
  {
    id: "1",
    primary: "Ramp",
    secondary: "fintech · ramp.com",
    fields: [
      { label: "Suggested by", value: "verified · 340 karma" },
      { label: "Domain", value: "valid (MX ok)" },
      { label: "Dedup", value: "no near-match" },
    ],
    badges: [{ label: "auto-approve eligible", tone: "good" }],
    createdAt: ago(7),
  },
  {
    id: "2",
    primary: "Acme Corp",
    secondary: "unknown industry · acme.test",
    fields: [
      { label: "Suggested by", value: "unverified · 0 karma" },
      { label: "Domain", value: "test TLD — suspect" },
      { label: "Dedup", value: "near: ‘ACME Co’" },
    ],
    badges: [{ label: "needs eyes", tone: "warn" }],
    createdAt: ago(52),
  },
  {
    id: "3",
    primary: "Vercel",
    secondary: "developer tools · vercel.com",
    fields: [
      { label: "Suggested by", value: "verified · 1.2k karma" },
      { label: "Domain", value: "valid" },
      { label: "Dedup", value: "no near-match" },
    ],
    createdAt: ago(180),
  },
];

const mockAction: QueueActionFn = async ({ itemIds, reason }) => {
  await new Promise((r) => setTimeout(r, 450));
  // Demo a failure path: rejecting "Acme Corp" (id 2) without a reason can't
  // happen (the prompt enforces it), so simulate a server-side veto instead.
  if (reason?.toLowerCase().includes("fail")) {
    return { ok: false, error: "Simulated server error — type anything else." };
  }
  return { ok: true, processed: itemIds };
};

export function ModQueueDemo() {
  return (
    <ModQueue config={QUEUE_CONFIGS.companies} items={MOCK_ITEMS} action={mockAction} />
  );
}
