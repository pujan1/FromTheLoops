---
status: proposed
date: 2026-06-13
deciders: [pujan]
---

# ADR-0011 — Comments & reactions on reports

## Context

Reports are read-only artifacts today. The only reader→report signal is the
**helpful-flag** (ADR-0007): a verified-only, rate-limited, karma-weighted "this
report taught me something" toggle. There is no way for a reader to *ask* ("how
long was the onsite?"), *answer* ("I got this exact question — here's how I
approached it"), or *react casually*. For an interview-prep audience that last
mile — discussion attached to the concrete question someone was asked — is where
a lot of the value is.

We want three things: **comments** (flat discussion on a report), the ability for
a comment to **quote a specific question** from that report (collapsed one-liner,
expand on click — WhatsApp/Telegram reply feel, *not* Reddit nesting), and
casual **likes + share** on the post.

Hard constraints this lands inside:

- **Anonymity-first.** Reports are anonymous-by-default (PLAN.md §Anonymity);
  whatever identity model comments use cannot betray that.
- **Section 230 hygiene** (ADR-0004): admins approve/reject/**hide**/delete only,
  never edit user content, and every action is logged in `mod_action_logs`.
  Freeform comments about *named* companies and people are the highest-risk UGC on
  the platform.
- **SEO posture.** The site lives on crawlable SSR and a deliberate avoidance of
  thin/spammy content — questions don't even get their own pages. Unmoderated UGC
  is an SEO liability, not an asset, until proven otherwise.
- **Existing engagement primitive.** `helpful_flags` already exists and must keep
  its precise meaning; a generic "like" must not blur into it.
- **Shared render path.** `<ReportDetailBody>` (ADR-0010) renders the report tree
  on both the SSR detail page and the client triage pane/peek. Anything added to
  it shows up in triage too.
- **PII lifecycle.** Free-text prose is cleared by the 90-day purge after a soft
  delete (ADR-0004); comment bodies are free text and must join that sweep.

No notification infrastructure exists (one transactional email; the `events`
outbox feeds aggregates/search/karma only).

## Decision

**Add a flat (non-nested) comment thread, a lightweight like on both posts and
comments, and a share affordance. Comments post instantly and are moderated
reactively. The existing helpful-flag is left untouched as the distinct,
verified, karma-weighted quality signal.**

### Data model (new tables, following `helpful_flags` conventions)

- **`comments`** — one row per comment, always rendered as a flat list:
  - `report_id` FK→reports (`CASCADE`), `author_user_id` FK→users (`RESTRICT`).
  - `body` plain text, Zod-validated, ≤ ~2000 chars.
  - `display_attribution` (reuse the existing enum) — per-comment anon/name
    toggle, defaulting to the user's `default_display_attribution`. **Anonymous by
    default**, mirroring reports.
  - `reply_to_comment_id` nullable FK→comments (`SET NULL`) — quotes another
    comment, still flat.
  - `quoted_question_id` nullable FK→questions (`SET NULL`) **plus**
    `quoted_text` — a frozen snapshot of the question at quote-time.
  - `edited_at`, `deleted_at`, `pii_purged_at`, `created_at`, plus a `hidden`
    state for moderation.
  - Both reference columns are nullable and schema-independent; the **composer
    attaches at most one quote chip** (a question *or* a comment) to keep the UX
    single-target.
- **`post_likes`** `(report_id, user_id)` unique, and **`comment_likes`**
  `(comment_id, user_id)` unique — casual toggles, any signed-in user,
  self-like prevented (as `self_flag` is). Two dedicated tables, not a
  polymorphic one, matching the `helpful_flags` shape (FK + cascade per target).
- **`helpful_flags` unchanged.** "Like" (casual, anyone) and "Helpful" (verified,
  karma, ranks search) are two labeled buttons with two meanings.

### Behavior

- **Identity:** per-comment anon/name toggle, anonymous default.
- **Posting:** any signed-in user; **instant** (`active` on insert);
  rate-limited in the data-access layer (the `helpful_flags` pattern). Signed-out
  readers read but get a sign-in prompt.
- **Content:** plain text only. Rendered escaped, bare URLs auto-linkified with
  `rel="nofollow ugc noopener"`. No markdown/images/embeds/@mentions in v1.
- **Edit/delete:** author can **edit anytime** (shows "edited"); **soft-delete**
  anytime → renders `[deleted]` if another comment references it, else hidden.
  Body + `quoted_text` cleared by the 90-day PII purge once deleted.
- **Quote UX:** an inline **"Reply"** affordance on each question and each comment
  focuses one shared composer with a removable quote chip. The quote renders as
  an ellipsized one-liner; click expands and (while the target survives) jumps to
  the question in the tree.
- **Likes:** lightweight toggle on posts and comments. The vanity count grants no
  karma; **comment likes accrue the commenter karma** — small, per-comment-capped
  *and* daily-globally-capped, **all likers count** (no verification branch). A
  new earn term in the karma recompute job. As with report karma (ADR-0007), this
  **must not feed search ranking**.
- **Share:** `navigator.share` with copy-link-to-clipboard fallback + toast;
  shares the canonical `/reports/:id` URL; logs a `share` analytics event.
- **Moderation:** a reader "Report comment" path; admins hide/delete via a new
  **`hide`** value on the `mod_action_type` enum, logged in `mod_action_logs`
  with polymorphic `target_type='comment'`.
- **Counts:** detail page computes live; report **cards** (list/triage/profile/
  company-feed/search) get counts via **one batched `GROUP BY report_id`** query
  over the page's IDs — no new columns, no drift, no backfill. Denormalize later
  only if a hot path (wedge page) profiles badly.

### Rendering & visibility

- Comments are added inside `<ReportDetailBody>`, so they reach the triage pane,
  but loading is split to protect both SEO and triage performance:
  - **Full `/reports/:id` page:** SSR the first page (~15 comments) so they paint
    fast and work without JS, but **kept out of the indexable content** (not in
    structured data; spam never becomes SEO money-content) — then a client
    **"Load more"**.
  - **Every other surface** (triage pane/peek, etc.): render a collapsed
    **"Comments (N)"** toggle that **lazy-fetches on expand only** — no comment
    API calls during rapid j/k triage nav.
- Comments read+post on **`active`** reports only. `pending_moderation` shows no
  comment section; `deleted` hides comments entirely (and they purge with the
  report).

## Alternatives considered

| Option | Why not |
|---|---|
| Nested/threaded comments (Reddit) | Explicitly unwanted; a flat list with a quote-reference gives the "reply to one thing" feel without a tree to render, paginate, or moderate. |
| Pre-moderate comments like reports | Destroys the conversational feel and buries mods under comment volume (comments ≫ reports). Reactive hide/delete + rate limits is the standard tradeoff. |
| Reuse `helpful_flags` as the "like" | Collapses two distinct signals into one; weakens the verified, karma-weighted quality signal that ranks search. Kept separate. |
| Verified-only comments (match helpful-flags) | Pool too small; threads stay empty. Comments are lower-stakes than a karma-granting endorsement. |
| FK-only quote (render question live) | An author editing within 24h silently rewrites history under the commenter, and a cascade-deleted question breaks the quote. Snapshot + FK stays correct. |
| Snapshot-only quote (no FK) | Loses jump-to-question and question↔comment analytics. |
| Denormalized like/comment counters now | Adds write-path upkeep, a backfill migration, and drift-correction for a perf win we haven't shown we need. Batched query first. |
| SSR comments as indexable content | Indexes unmoderated UGC the instant it posts — directly against the thin-content stance. Render but don't index; `nofollow` links. |
| Comments eager-loaded everywhere `<ReportDetailBody>` renders | Pulls comment queries into the triage peek during fast nav. Collapsed lazy toggle off the full page saves the calls. |
| Polymorphic single `likes` table | A dedicated table per target matches `helpful_flags`, keeps FK cascades honest, and avoids a nullable-target/check-constraint shape. |
| Verified-weighted comment-like karma | Considered (mirrors helpful-flags); chose all-likes-count, small + double-capped, for simpler casual engagement — caps are the anti-farm brake. |
| Notifications in v1 | No inbox/email infra exists and anonymous authors can't be addressed anyway. Deferred until there's an in-app inbox. |

## Consequences

### Positive

- Delivers ask-and-answer discussion anchored to the exact question someone was
  asked — the highest-value surface for prep.
- Anonymity, Section 230 hygiene, and the PII purge all extend cleanly: comments
  reuse the attribution enum, the mod-log polymorphism, and the 90-day sweep.
- `helpful_flags` keeps its precise meaning; "like" and "helpful" stay legibly
  distinct.
- SSR-but-not-indexed + `nofollow` + active-only confines the SEO/spam blast
  radius of instant UGC.
- Lazy collapsed comments off the triage surface keep j/k nav snappy and SSR list
  pages lean.

### Negative

- Instant posting means spam/defamation is live before a mod acts; mitigated, not
  eliminated, by rate limits + the report path + non-indexing.
- Comment likes touch karma — a recompute earn term plus farm-resistance caps to
  tune; the all-likes-count choice is the weakest anti-farm option by design.
- `<ReportDetailBody>` gains a client-data feature; triage now has a (gated)
  comment fetch path.
- A new type-altering migration for the `hide` enum value, plus three new tables.

### Neutral / open

- **Migration is dev-only**, applied to prod by hand (project convention; see the
  ADR-0010 migration note).
- **Counter denormalization** is deferred behind the batched query — promote only
  on profiling evidence.
- **Notifications / @mentions** deferred; the `events` outbox is the natural
  future trigger.
- **Rate-limit and karma-cap constants** are tunable and unproven — start
  conservative, instrument, adjust.
- Comment-like karma weighting may need to move to verified-weighted (the
  helpful-flag model) if farming shows up.

## References

- [ADR-0004](0004-validation-and-soft-delete.md) — soft-delete, 90-day PII purge, anti-abuse rate limiting this reuses.
- [ADR-0007](0007-karma-design.md) — karma earn/recompute + the "never boost own ranking" non-goal the comment-like term must honor.
- [ADR-0010](0010-report-triage-master-detail.md) — `<ReportDetailBody>` shared render; the triage pane comments must not slow.
- `packages/db/src/schema/helpful-flags.ts` — toggle-table + cascade pattern the like tables mirror.
- `packages/db/src/schema/moderation.ts` — polymorphic `mod_action_logs` the comment-report path writes to.
- `apps/web/app/reports/[id]/page.tsx` — where the comments section + share are wired (alongside the existing helpful-flag).
