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
fans out to every package's `test` script. Today `apps/web`, `apps/worker`,
and `packages/search` all have `"test": "echo 'no tests yet'"` — so CI is
green while large parts of the app are unexercised.

### Coverage map (what's actually tested)

| Area | Files | Status |
|------|-------|--------|
| `packages/core` (submit, moderation, anti-abuse regex, karma tier, url, scope) | 6 tests | ✅ good |
| `packages/shared` (submission finalize, anti-abuse, url) | 3 tests | ✅ good |
| `packages/db` (reports, karma, comments, likes, aggregates, drafts, taxonomy, browse, soft-delete, audit…) | 22 tests | ✅ strong |
| `apps/web` server actions | 8 action files | ❌ none |
| `apps/web/lib` helpers (admin/RBAC, rate-limit, view-as, format, labels, roles) | ~14 files | 🟡 6 specs / 43 tests (Phase 1: RBAC, rate-limit fail-open, view-as re-check, formatters) |
| `apps/web` e2e journeys | 7 specs | 🟡 happy paths (submit, browse, abuse, lifecycle) + error paths (auth-gates, not-found, submission-validation) |
| `apps/worker` jobs | 7 jobs | ❌ none |
| `packages/search` (indexers, query, schemas) | 7 files | ❌ none |
| Admin / moderation (Sprint 6) action layer | blocklist, view-as, queues | ❌ none |

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
| **Error:** rate limit exceeded on autosave/suggest → `RATE_LIMIT_MESSAGE` | **action** | ❌ |
| **Error:** unauthenticated finalize → rejected, nothing written | **action** | ❌ |
| **Error:** invalid draft schema → `actionError`, no DB write | **action** | ❌ |
| Submission-confirmed email enqueued (best-effort, never throws into success) | **action** | ❌ |

### B. Report lifecycle (view / edit / delete / export)

| Path | Layer | Status |
|------|-------|--------|
| Owner view + edit + soft-delete | e2e + db | ✅ |
| Soft-delete scopes to owner; non-owner cannot delete | **action** + db | 🟡 (db yes, action no) |
| Edit after window closes → rejected | **action** + db | ❌ |
| Export report (`/api/export`, `/api/reports/[id]`) happy + 404/403 | **api route** | ❌ |
| `revalidateTag(reportDetailTag)` fires on edit/delete | **action** | ❌ |

### C. Comments & reactions

| Path | Layer | Status |
|------|-------|--------|
| Post comment, like comment, karma side-effects | db | ✅ |
| Post comment via action → auth + ownership + revalidate | **action** | ❌ |
| **Error:** comment while impersonating → `assertNotImpersonating` refuses | **action** | ❌ |
| **Error:** empty / over-length / unauth comment | **action** | ❌ |
| Like idempotency (double-like is a no-op) | db | ✅ |

### D. Browse & search (public, SEO surfaces)

| Path | Layer | Status |
|------|-------|--------|
| companies → company → role page | e2e + db browse | ✅ |
| Sparse-level banner / SDE III thin feed | e2e | ✅ |
| Topics browse, taxonomy queries | db | ✅ |
| Typesense indexing of a report (indexer shape) | **search** | ❌ |
| Search query builder (filters, ranking) | **search** | ❌ |
| **Error:** Typesense unreachable → page degrades, no crash | **search/e2e** | ❌ |

### E. Admin / moderation (Sprint 6)

| Path | Layer | Status |
|------|-------|--------|
| Held-report queue, flags, soft-delete, audit log rows | db moderation | 🟡 |
| RBAC: `requireRole`/`requireAdmin` → `notFound()` for under-privileged | **lib/admin** | ✅ |
| Break-glass `ADMIN_CLERK_IDS` allowlist resolves to super_admin | **lib/admin** | ✅ |
| Blocklist add/remove/enable → admin-gated, self-auditing | **action** + db | 🟡 (db side started) |
| **Error:** non-admin hits blocklist action → refused | **action** | ❌ |
| View-as: enter/exit impersonation, admin re-checked on every read | **lib/view-as** | 🟡 (read-side re-check ✅; enter/exit actions ❌) |
| **Error:** non-admin hand-sets view-as cookie → nothing impersonated | **lib/view-as** | ✅ |
| **Error:** write attempted while impersonating → blocked | **action/middleware** | ❌ |
| Auto-approve sweep promotes only eligible reports | db auto-approve | 🟡 |
| Queue config / taxonomy approve actions | **action** | ❌ |

### F. Worker jobs (background)

| Path | Layer | Status |
|------|-------|--------|
| `reconcile`: runs all 3 passes; one pass failing doesn't block others; re-throws on any failure | **job** | ❌ |
| `recompute-karma`: recomputes correctly, idempotent | **job** + db | 🟡 (db karma yes) |
| `refresh-aggregate`: aggregate cells recomputed | **job** + db | 🟡 |
| `index-typesense`: enqueues/indexes report, handles missing report | **job** | ❌ |
| `send-email`: renders + sends, no-op without recipient, errors swallowed | **job** | ❌ |
| `purge-deleted-pii`: purges only past-retention soft-deleted rows | **job** + db | ❌ |

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

### Phase 2 — `packages/search` unit tests
Indexer document shape, query builder (filters/ranking), schema definitions.
Mock the Typesense client. → Add Vitest + `"test": "vitest run"`.
**Catches:** silent index/search drift.

### Phase 3 — `apps/worker` job integration tests
Reuse the `db` Testcontainers pattern (real Postgres), mock the search client
and email transport. Focus on `reconcile` failure-isolation semantics and the
idempotent passes. → Add Vitest to `apps/worker`.
**Catches:** the backstop jobs silently breaking — invisible until data drifts.

### Phase 4 — `apps/web` server-action integration tests
The biggest lift. Real DB (Testcontainers), mock Clerk (`currentUser`/`auth`)
and the BullMQ queue. Assert the full chain: auth gate → ownership → rate
limit → write → `revalidateTag` → enqueue, plus every `actionError` branch.
Cover submit, report edit/delete, comments, blocklist, view-as.
**Catches:** the auth/ownership/error-mapping bugs that pure logic tests can't see.

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
