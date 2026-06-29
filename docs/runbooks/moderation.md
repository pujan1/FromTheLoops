# Runbook — Daily moderation cycle

> **Last verified: 2026-06-29** (Sprint 6 Day 10 — written against the panel as
> built through Day 9; evidence queue still parked on R2).

The daily job that keeps the platform clean. PLAN.md §Moderation operations
budgets **30–45 min/day at alpha (~100 users)**; this runbook is the path that
fits in that window. Work the queues top-to-bottom in the tab order — they're
arranged roughly newest-risk-first — and you're done when every queue reads its
empty state.

Everything here is point-and-click in the panel. There's no CLI step in the daily
cycle; the only terminal commands are the optional backstops in [§Backstops](#backstops).

## Mental model — what the panel is

`/admin/*` is the whole moderation surface. Three things to hold in your head:

- **Auto-approve already ran.** Low-risk pending taxonomy (verified submitter +
  clean name + no near-duplicate) promotes itself on submit and again on the daily
  worker sweep. So the **queues only show the judgement calls** — the stuff a
  human has to decide. An empty Companies/Tags queue is the normal, healthy state,
  not a sign nothing was submitted. See [ADR-0008](../adr/0008-rbac-evidence-audit.md).
- **Every action is logged.** Approve / reject / hide / restore / merge all write
  a `mod_action_logs` row. Reject and Hide **require a reason** before the button
  enables — that reason is the Section-230 paper trail, so write a real one.
- **You can't edit user content.** The panel only offers approve / reject / hide /
  restore / dismiss. There is deliberately no "edit the body" affordance (Section
  230 — we don't become the author by editing). If something's wrong, you remove
  it, you don't fix it.

## Prerequisites (one-time)

- [ ] You can reach `/admin` — i.e. you're either in `ADMIN_CLERK_IDS` (break-glass
      super_admin) or your Clerk `publicMetadata.role` is `moderator` or higher,
      **and** the session token carries the role claim (Clerk Dashboard → Sessions
      → Customize session token: `{ "metadata": "{{user.public_metadata}}" }`).
      Without all that you get a **404** (not a 403 — the route hides its own
      existence). Full setup: `sprints/sprint-06-admin-moderation.md` Day 1.
- [ ] You know the difference between **moderator** and **admin** tabs: the
      Blocklist and Health tabs only appear for `admin`+. Everything in the daily
      cycle below is moderator-level.

---

## The daily cycle

Open `/admin` (lands on the first queue). Walk the tabs left to right.

### 1. Companies / Tags / Roles — pending taxonomy

> Tabs: **Companies**, **Tags**, **Roles**. These are bulk queues (select-all + per-row checkboxes).

What's here: user-suggested companies, topic tags, and role aliases that auto-approve
*didn't* clear — almost always because of a **near-duplicate** (a "possible dup: X
(NN%)" badge) or an unverified submitter.

- **Near-dup badge (warn, ≥55%):** this is a *new-vs-merge* call, which is exactly
  why the heuristic kicked it to you. If it's genuinely the same entity → for
  roles, **Approve** folds the alias into the canonical (a `merge`); for
  companies/tags there's no merge action, so **Reject** the dup and keep the
  canonical. If it's genuinely distinct → **Approve**.
- **No badge, looks legit:** Approve. It only landed here because the submitter
  wasn't verified.
- **Junk / spam / slur:** Reject with a reason. (If it's a *pattern* you'll see
  again, also add it to the Blocklist — see step 7.)
- **Bulk:** tick several clean rows, hit **Approve** once. Reject is per-reason, so
  bulk-reject shares one reason across the batch — only batch rows you'd reject for
  the same cause.

Approving a company is what lets reports referencing it enter the aggregates, so
clearing this queue is what makes new companies "real".

### 2. Held — new-user first submissions

> Tab: **Held**. Bulk queue.

What's here: **every** first report sits in `pending_moderation` until you release
it (in V1 nothing sets `evidence_verified`, so all reports route through here). This
is the content gate and usually the bulk of the daily minutes.

- Skim the report (each row deep-links to `/reports/:id`).
- **Approve** → flips it `active`; it immediately counts toward aggregates and gets
  indexed for search (the action emits the report event for you).
- **Reject** (reason required) → `rejected`; it never went live so no aggregate/search
  cleanup is needed. The author still sees it on their own dashboard as "Not
  approved" (deliberate transparency); the *reason* isn't surfaced to them yet — it
  lives in the audit log.
- Bulk-approve a batch of obviously-fine reports in one click.

### 3. Flags — community-reported content

> Tab: **Flags**. Per-item (no bulk — each is a judgement call). Open flags are **grouped by content**, so one row = one reported item with a flag count.

- **Sensitive badge** (reasons include PII/harassment) → look first.
- **Hide** (reason required) → removes it from public view. A hidden *report*
  becomes `deleted` and therefore shows up in the Soft-delete queue (that's your
  un-hide path); a hidden *comment* becomes `hidden`. The action drops it from
  aggregates/search for you.
- **Dismiss** → the flags were unfounded; content stays. Dismiss writes **no**
  `mod_action_logs` row (the flag rows are self-auditing via `resolved_by`), so
  don't expect it in the audit timeline.

> Note: in the running app this queue is **seed-only** until the reader-side
> "Report" button ships (tracked follow-up — `content_flags` has the table + index
> but no writer yet). If you see real rows here, the writer has landed.

### 4. Soft-delete — the 90-day undo window

> Tab: **Soft-delete**. Per-item.

What's here: reports/comments soft-deleted in the last 90 days, before the PII
purge worker erases them for good. A **"purging soon"** badge marks items ≤7 days
from erasure.

- This is a *review/undo* queue, not a daily-action queue — most days you scroll it
  and do nothing.
- **Restore** an item only if a deletion was accidental or contested → flips it back
  to `active` and clears `deleted_at`. Restore refuses anything already PII-purged
  (its prose is gone, nothing to bring back).

### 5. Audit — did anything look wrong?

> Tab: **Audit**. Read-only timeline.

A reverse-chronological feed of every logged action (mod + verb + target + reason).
Use it to:

- Sanity-check your own session's actions before you log off.
- Click a target to see that one entity's full history (`?type=&id=`).
- It's also where a reject reason lives if an author asks why.

### 6. Auto-approve — spot-check what the robot did

> Tab: **Auto-approve**. Read-only, last 24h.

The 24-hour list of everything **auto-approved** without a human click (actor =
"Auto-moderator"). Skim it for anything the heuristic shouldn't have let through.

- **To reverse a bad auto-approval:** the deep-link takes you to that entity's audit
  history; from the relevant queue you'd Reject/Hide it like any other item. (A
  one-click "this was wrong" from this view is a deferred nicety — for now it's
  manual.)
- This list starts **empty** until a *verified* account suggests a clean, unique
  company/tag — so empty here is normal early on.

### 7. (Admin only) Blocklist — tune the auto-rules

> Tab: **Blocklist**. Visible to `admin`+ only. Not a daily task — touch it when you
> notice a pattern.

The editable slur/PII/spam regex list. A name matching an **enabled** pattern is
blocked from auto-approving (it still gets *suggested* — it just lands in the human
queue instead of self-promoting).

- Saw the same junk name in step 1 twice? Add a pattern here so it stops
  auto-approving and you stop seeing variants.
- Use the **live tester** (type a sample name → see which enabled patterns trip)
  before saving — a typo'd regex that doesn't compile is skipped silently, so the
  tester is how you confirm it actually matches.
- Edits hot-reload within ~60s (no redeploy); the web side propagates instantly.
- Patterns are trusted and **not** ReDoS-sandboxed — keep them simple.

### 8. (Admin only) Health — is the pipeline alive?

> Tab: **Health**. Visible to `admin`+ only.

A glance at queue/worker health. Check it if aggregates or search look stale (e.g.
a just-approved report isn't showing up); otherwise skip.

---

## When done

Every queue reads its empty/quiet state, the Audit feed matches what you did this
session, and nothing in Auto-approve looks wrong. Log off. That's the cycle.

---

## Backstops

These are **not** part of the daily click-through — they're the manual levers for
when something looks off.

**The daily reconciliation worker already runs** (`reconcile` job, cron `23 4 * * *`
on the Hetzner box): it re-sweeps pending taxonomy through auto-approve, rebuilds
every aggregate cell, and re-imports all Typesense docs. So drift normally
self-heals overnight. If you can't wait for the 4:23am run, trigger the pieces by
hand:

```bash
# Force the auto-approve sweep now (promotes any eligible pending taxonomy).
# Safe + idempotent — re-running never double-promotes.
pnpm --filter @fromtheloop/db autoapprove
```

For aggregate / search drift specifically, the worker is the owner of those
refreshes — see `docs/runbooks/worker-deploy.md` for how to reach the box and read
its logs. The reconcile job is idempotent, so re-running it is always safe.

## "Undo" — how to reverse each action

Nothing here is truly destructive in V1 (the 90-day PII purge worker owns the only
hard erasure), so most actions are reversible:

| You did | To undo |
|---|---|
| Approved a pending company/tag (wrong) | It's now `active` — there's no un-approve; reject it as a duplicate or, if it's referenced, leave it (reports FK to it with `ON DELETE RESTRICT`). |
| Rejected a pending item (should've kept) | No restore queue for taxonomy — the submitter can re-suggest, or re-add it directly in the DB. Rare; reject only what's clearly junk. |
| Approved a held report (should've held) | Soft-delete it from the report's owner-equivalent path, or Hide via the flags path; it then appears in Soft-delete to Restore later. |
| Hid flagged content | A hidden *report* is in the **Soft-delete** queue → Restore. A hidden *comment* → restore via the same soft-delete path. |
| Restored something (shouldn't have) | Soft-delete it again; it re-enters the 90-day window. |
| Auto-approve let something bad through | Reverse it like a manual approval (table rows above); the Auto-approve tab deep-links you to it. |

If you're ever unsure whether an action stuck, the **Audit** tab is the source of
truth — every removal/restore/approval has a row there with who, when, and why.
