# Test plan

A workflow-by-workflow map of what we test, where, and what's still missing.
Goal: every workflow has both a **happy path** and its **error paths** covered
at the cheapest layer that can actually catch the bug.

> Frontend-engineer framing: think of this like component testing. The
> "pure logic" packages (`core`, `shared`) are your utility functions — fast
> unit tests, no I/O. The `db` package is like testing a hook that hits an
> API, except we spin up a **real throwaway Postgres** (Testcontainers) instead
> of mocking. The `web`/`worker` apps are the "integration" layer that wires
> auth + queue + DB together — that's where most of our gaps are.

---

## 1. Current state

### Tooling

| Layer | Tool | Where | In CI? |
|-------|------|-------|--------|
| Unit (pure logic) | Vitest | `packages/core`, `packages/shared`, `apps/web/lib` | ✅ `pnpm test` |
| Integration (real DB) | Vitest + Testcontainers (Postgres) | `packages/db` | ✅ `pnpm test` |
| E2E (real browser + Clerk) | Playwright | `apps/web/e2e` | ❌ manual (needs Clerk secret + seeded DB) |

CI (`.github/workflows/ci.yml`) runs `typecheck → lint → test`. `pnpm test`
fans out to every package's `test` script. `apps/web` (lib units),
`packages/search`, and `apps/worker` now run real Vitest suites. `apps/web`'s
Vitest is split into two projects in one run: `lib` (pure units, no infra) and
`actions` (server-action integration against a Testcontainers Postgres — Phase 4).
Phase 4 now covers admin + submit + report + comment actions; only the happy-path
finalize+email fixture is deferred (see Phase 4 below).

### Coverage map (what's actually tested)

| Area | Files | Status |
|------|-------|--------|
| `packages/core` (submit, moderation, anti-abuse regex, karma tier, url, scope) | 6 tests | ✅ good |
| `packages/shared` (submission finalize, anti-abuse, url) | 3 tests | ✅ good |
| `packages/db` (reports, karma, comments, likes, aggregates, drafts, taxonomy, browse, soft-delete, audit…) | 22 tests | ✅ strong |
| `apps/web` server actions | 8 action files | ✅ 6 specs / 48 tests (Phase 4): admin (blocklist/view-as/queues) + submit/report/comment guards; only the happy-path finalize+email is deferred (core/e2e) |
| `apps/web/lib` helpers (admin/RBAC, rate-limit, view-as, format, labels, roles) | ~14 files | 🟡 6 specs / 43 tests (Phase 1: RBAC, rate-limit fail-open, view-as re-check, formatters) |
| `apps/web` e2e journeys | 7 specs | 🟡 happy paths (submit, browse, abuse, lifecycle) + error paths (auth-gates, not-found, submission-validation) |
| `apps/worker` jobs | 7 jobs | 🟡 5 specs / 18 tests (Phase 3: reconcile failure-isolation, send-email branches, event/sweep dispatch, debounced karma enqueue) |
| `packages/search` (indexers, query, schemas) | 7 files | ✅ 4 specs / 40 tests (Phase 2: doc builders, filter_by/match-all query shape, import/delete control flow, schema drift guard) |
| Admin / moderation (Sprint 6) action layer | blocklist, view-as, queues | ✅ 3 specs / 20 tests (real DB) |

---

## 2. Testing strategy — which workflow goes where

Pick the **lowest** layer that can catch the class of bug:

- **Pure decision/logic** (validation, regex blocks, karma math, scope keys,
  role comparison) → **unit test** in `core`/`shared`/`lib`. No I/O.
- **DB behavior** (constraints, ownership scoping, idempotency, soft-delete,
  aggregate recompute, audit rows) → **integration test** in `db` against the
  Testcontainers Postgres.
- **Server-action wiring** (auth gate → ownership → rate limit → DB write →
  revalidate → enqueue, and the error mapping back to the form) → **action
  integration test** in `apps/web` with Clerk + queue mocked, real DB.
- **Full user journey across pages** (the few that need a real browser/session)
  → **Playwright e2e**.
- **Worker job orchestration** (runs N idempotent passes, isolates failures,
  re-throws so BullMQ retries) → **job integration test** in `apps/worker`,
  real DB, search client mocked.

---

## 3. Workflow test matrix

Each workflow lists happy path + the error paths that must be asserted. ✅ = covered,
🟡 = partial, ❌ = missing.

### A. Submission (draft → finalize → report)

| Path | Layer | Status |
|------|-------|--------|
| Autosave draft, leave, resume | e2e + db drafts | ✅ |
| Finalize a complete report → land on owner view | e2e + core submit | ✅ |
| Edit within window → soft-delete frees the per-company slot | e2e | ✅ |
| **Error:** contact info in prose → regex block, form stays put | e2e + core | ✅ |
| **Error:** honeypot tripped → silent drop | e2e | ✅ |
| **Error:** 2nd report same company/user → per-company cap rejected | db/core | 🟡 (logic only, not at action) |
| **Error:** rate limit exceeded on autosave/finalize → `RATE_LIMIT_MESSAGE` | **action** | ✅ |
| **Error:** unauthenticated save/finalize → rejected, nothing written | **action** | ✅ |
| **Error:** invalid draft schema → `actionError`, no DB write | **action** | ✅ |
| Honeypot tripped on save/finalize → benign success, silent no-write | **action** | ✅ |
| Submission-confirmed email enqueued (best-effort, never throws into success) | **action** | 🟡 (queue edge mocked + ready; needs a happy-path finalize fixture — deferred to e2e/core) |

### B. Report lifecycle (view / edit / delete / export)

| Path | Layer | Status |
|------|-------|--------|
| Owner view + edit + soft-delete | e2e + db | ✅ |
| Soft-delete scopes to owner; non-owner cannot delete | **action** + db | ✅ (non-owner = silent no-op, report survives) |
| Edit-entry: foreign id 404s, signed-out → sign-in, impersonating refused | **action** | ✅ |
| Edit after window closes → bounced to report view, no edit draft | **action** + db | ✅ |
| Export report (`/api/export`, `/api/reports/[id]`) happy + 404/403 | **api route** | ❌ |
| `revalidateTag(reportDetailTag)` fires on delete | **action** | ✅ (edit-in-place tag bust still via finalize) |

### C. Comments & reactions

| Path | Layer | Status |
|------|-------|--------|
| Post comment, like comment, karma side-effects | db | ✅ |
| Post comment via action → auth + active-report + revalidate | **action** | ✅ |
| Edit / soft-delete own comment via action | **action** | ✅ |
| **Error:** comment write while impersonating → `read_only_view_as` refusal | **action** | ✅ |
| **Error:** empty / over-length / unauth comment | **action** | ✅ |
| Like idempotency (double-like is a no-op) | db | ✅ |

### D. Browse & search (public, SEO surfaces)

| Path | Layer | Status |
|------|-------|--------|
| companies → company → role page | e2e + db browse | ✅ |
| Sparse-level banner / SDE III thin feed | e2e | ✅ |
| Topics browse, taxonomy queries | db | ✅ |
| Typesense indexing of a report (indexer shape) | **search** | ✅ |
| Search query builder (filters, ranking) | **search** | ✅ |
| **Error:** import partial-failure throws (no silent index drop) | **search** | ✅ |
| **Error:** delete tolerates 404, rethrows other errors | **search** | ✅ |
| **Error:** Typesense unreachable → page degrades, no crash | **search/e2e** | ❌ |

### E. Admin / moderation (Sprint 6)

| Path | Layer | Status |
|------|-------|--------|
| Held-report queue, flags, soft-delete, audit log rows | db moderation | 🟡 |
| RBAC: `requireRole`/`requireAdmin` → `notFound()` for under-privileged | **lib/admin** | ✅ |
| Break-glass `ADMIN_CLERK_IDS` allowlist resolves to super_admin | **lib/admin** | ✅ |
| Blocklist add/remove/enable → admin-gated, self-auditing | **action** + db | ✅ |
| **Error:** non-admin hits blocklist action → refused | **action** | ✅ |
| View-as: enter/exit impersonation, admin re-checked on every read | **lib/view-as** + **action** | ✅ (read-side re-check ✅; enter/exit actions ✅ — gate, audit row, self/missing-target guards) |
| **Error:** non-admin hand-sets view-as cookie → nothing impersonated | **lib/view-as** | ✅ |
| **Error:** write attempted while impersonating → blocked | **action/middleware** | ❌ |
| Auto-approve sweep promotes only eligible reports | db auto-approve | 🟡 |
| Queue config / taxonomy approve actions | **action** | ✅ (gate, unknown-queue/unwired-action reject, reason-required backstop, approve promotes + audits) |

### F. Worker jobs (background)

| Path | Layer | Status |
|------|-------|--------|
| `reconcile`: runs all 3 passes; one pass failing doesn't block others; re-throws on any failure | **job** | ✅ |
| `recompute-karma`: stage-1 resolve → debounced per-user enqueue → mark drained; sweep | **job** + db | ✅ (job orchestration; recompute itself in db) |
| `refresh-aggregate`: event-vs-sweep routing, sweep drains oldest-first | **job** + db | ✅ (routing; cell recompute in db) |
| `index-typesense`: per-event index vs sweep drain, oldest-first | **job** | ✅ (indexReportForEvent itself in search) |
| `send-email`: sends, no-op without API key, throws on Resend error (BullMQ retries) | **job** | ✅ |
| `purge-deleted-pii`: purges only past-retention soft-deleted rows | **job** + db | ✅ (cutoff filter tested in db `purgeDeleted*`) |

### G. Cross-cutting / infra

| Path | Layer | Status |
|------|-------|--------|
| `middleware.ts`: `/admin(.*)` requires session; write routes blocked while impersonating | e2e/unit | ❌ |
| `rate-limit.ts`: fixed-window counter; **fail-open** when Redis down | **lib** | ✅ |
| `format.ts` / `labels.ts` / `roles.ts` pure helpers | **lib** | ✅ |
| Migrations apply cleanly forward | db migration | ✅ |

---

## 4. Gaps → phased roadmap

Ordered by value-per-effort. Each phase is independently shippable and CI-wired.

### Phase 1 — `apps/web/lib` unit tests (cheapest, no infra) ✅ DONE
Pure-ish helpers, no DB/Clerk needed (or trivially stubbed):
`roles.ts` (role comparison), `admin.ts` (`adminClerkIds`, `getRole`,
`roleAtLeast` gating), `format.ts`, `labels.ts`, `rate-limit.ts` fail-open
logic, `view-as.ts` cookie/role re-check.
→ Vitest wired into `apps/web` (`vitest.config.ts` scoped to `lib/**/*.test.ts`
so it never collides with the Playwright `e2e/**/*.spec.ts` suite;
`"test": "vitest run"`). Edges (Clerk `auth`, `ioredis`, `next/headers`,
`@fromtheloop/db`) mocked per-test. **6 specs / 43 tests, green in CI.**
**Catches:** RBAC regressions, the highest-risk security surface.

### Phase 2 — `packages/search` unit tests ✅ DONE
Indexer document shape, query builder (filters/ranking), schema definitions.
A hand-rolled fake `Client` records the calls (no Typesense server), which also
lets us drive the import-failure / 404-delete branches. → Vitest wired
(`"test": "vitest run"`, scoped to `src/**/*.test.ts`). **4 specs / 40 tests.**
**Catches:** silent index/search drift — a renamed facet, a broken `filter_by`
string, an import partial-failure swallowed instead of thrown.

### Phase 3 — `apps/worker` job integration tests ✅ DONE
The jobs are thin orchestrators over `@fromtheloop/db` / `@fromtheloop/search`
(both already integration-tested against a real Postgres in their own packages),
so these mock those module edges instead of standing up a container — fast and
not a re-test of the DB layer. Covers `reconcile`'s per-pass failure isolation +
AggregateError collection, `send-email`'s no-op/throw branches, the
event-vs-sweep routing for the three outbox consumers, and the debounced
per-user karma enqueue. → Vitest wired in `apps/worker`. **5 specs / 18 tests.**
**Catches:** the backstop jobs silently breaking — invisible until data drifts.

### Phase 4 — `apps/web` server-action integration tests ✅ DONE (one happy-path fixture deferred)
The biggest lift. Real DB (Testcontainers), mock Clerk (`currentUser`/`auth`),
the rate limiter, and the BullMQ queue. Asserts the action chain: auth gate →
ownership → rate limit → write → `revalidate*` → enqueue, plus every
`actionError` / refusal branch.

Harness (`apps/web/vitest.config.ts` "actions" project + `tests/global-setup.ts`
+ `tests/setup.ts`): one container per run, `getDb()` repointed at it via env,
truncate-between-cases. A shared `tests/edges.ts` holds the mock state the
per-file `vi.mock` factories read — `signInAs({role})` drives `auth`/
`currentUser`; the cookie jar feeds the real `assertNotImpersonating`/view-as
logic; revalidated-paths + enqueued-jobs + a `rateLimitState` flag are captured
for assertions. Next's `notFound()`/`redirect()` are tagged throws so tests
assert which control-flow exit fired. `tests/seed.ts` inserts the minimal
report tree via `createReport` (skips the draft→finalize flow core already tests).

**6 specs / 48 tests:**
- **admin** — blocklist CRUD (admin gate, regex validation, category coercion,
  idempotent no-ops), view-as enter/exit (gate, audit row, self/missing-target
  guards, ungated exit), queue dispatcher (gate, unknown-queue/unwired-action
  reject, reason-required backstop, approve promotes + audits).
- **submit** — `saveDraft`/`finalize` guards: unauth, over-budget →
  `RATE_LIMIT_MESSAGE`, honeypot benign-success-no-write, malformed schema,
  ownership-scoped draft miss.
- **report** — edit-entry (foreign id 404, signed-out → sign-in, window-closed
  bounce, impersonation refusal) + soft-delete (owner flips status + busts the
  detail tag; non-owner is a silent no-op).
- **comments** — create/edit/delete: active-report happy path + revalidate,
  impersonation refusal, signed-out, empty/over-length passthrough.

**Deferred:** the happy-path `finalizeSubmission` + confirmation-email enqueue
(the queue edge is mocked and ready, but a fully submit-ready draft fixture
duplicates core/db coverage — better proven end-to-end). **Catches:** the
auth/ownership/error-mapping bugs that pure logic tests can't see.

### Phase 5 — E2E hardening + CI
Add admin/moderation journeys and the impersonation-write-block path. Decide
whether to run Playwright in CI (needs a seeded ephemeral DB + Clerk test
instance) or keep it a pre-release manual gate.

---

## 5. Conventions

- **Naming:** `*.test.ts` for unit/integration (Vitest), `*.spec.ts` for
  Playwright e2e. (Already the de-facto split — keep it.)
- **DB tests:** truncate between cases, don't recreate schema (see
  `packages/db/vitest.config.ts` rationale). One container per `vitest run`.
- **Mocking boundary:** mock at the *edge* (Clerk, BullMQ, Typesense, Resend),
  use the **real DB**. Mocked DB tests give false confidence on a SQL-heavy app.
- **Every workflow gets at least one error-path test**, not just happy path.
- Keep test comments lean — explain *why* the case exists (the bug it guards),
  matching the existing test style.
