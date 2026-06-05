-- Sprint 3 Day 1–2: canonical per-(company, role, level) aggregate.
--
-- ⚠️  Source of truth for review/readability. The IDENTICAL statements are
--     applied by migration src/migrations/0008_aggregates_company_role_level.sql
--     (the migrator only reads src/migrations/). tests/aggregates.test.ts
--     asserts these two files don't drift. Edit BOTH, or just the migration
--     and re-copy here.
--
-- WHY A TABLE, NOT A NATIVE MATERIALIZED VIEW (ADR-0003):
--   A Postgres MATERIALIZED VIEW can only be refreshed whole — REFRESH (even
--   CONCURRENTLY) recomputes every row. Sprint 3's required mitigation is to
--   "refresh only the affected (company, role, level) partition" on each
--   submit/edit/delete. That is impossible with a native matview, so the
--   aggregate is an incrementally-maintained summary TABLE instead: each row
--   is one cell (one "partition"), and refresh_aggregate_cell() recomputes a
--   single row via UPSERT. refresh_all_aggregates() is the full backfill.
--
-- TRUST WEIGHTING (PLAN.md §Aggregation weighting):
--   "Mix everything, weighted by trust tier: unverified 0.3, verified-pro 0.7,
--    recruiter-confirmed 1.0, verified-employee 1.0." V1 only has the
--   evidence_verified boolean wired (verified-employee path), so the mapping
--   collapses to {true → 1.0, false → 0.3}. The 0.7 / recruiter tiers get a
--   write path in a later sprint; report_trust_weight() is the single place to
--   extend when they do.
--
-- VISIBILITY FILTER:
--   Only status='active' AND deleted_at IS NULL reports feed the aggregate —
--   these are exactly the reports the Sprint 4 wedge page may render publicly.
--   pending_moderation / deleted rows never leak into an aggregate.

-- IMMUTABLE so it's inlinable and usable anywhere (incl. future index
-- expressions); PARALLEL SAFE so cell refreshes can parallelize.
CREATE OR REPLACE FUNCTION report_trust_weight(p_evidence_verified boolean)
  RETURNS numeric
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN p_evidence_verified THEN 1.0 ELSE 0.3 END::numeric $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS aggregates_company_role_level (
  -- Cell key: mirrors the wedge-page index dims (company_id, role_id, level).
  company_id uuid NOT NULL,
  canonical_role_id uuid NOT NULL,
  level text NOT NULL,
  -- Volume.
  report_count integer NOT NULL,
  -- Raw outcome distribution (NULL outcomes are counted only in report_count).
  outcome_offer integer NOT NULL DEFAULT 0,
  outcome_reject integer NOT NULL DEFAULT 0,
  outcome_withdrew integer NOT NULL DEFAULT 0,
  outcome_ghosted integer NOT NULL DEFAULT 0,
  outcome_pending integer NOT NULL DEFAULT 0,
  -- Trust-tier-weighted volume = SUM(report_trust_weight) over the cell. The
  -- confidence signal the wedge page uses to temper sparse/unverified cells.
  trust_weighted_count numeric NOT NULL DEFAULT 0,
  -- Common round structure.
  median_round_count numeric,            -- percentile_cont(0.5) of rounds/report
  mode_round_sequence text[],            -- modal ordered round_type sequence
  -- Top topic tags, frequency-weighted by the asking report's trust weight.
  -- jsonb array of {topic_id, slug, name, count, weighted_count}, ≤10, desc.
  top_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, canonical_role_id, level)
);
--> statement-breakpoint

-- Recompute exactly one cell from the base tables and UPSERT it. If the cell
-- has no live reports left (e.g. its last report was soft-deleted), the row is
-- removed instead. Idempotent: calling it twice yields the same row.
CREATE OR REPLACE FUNCTION refresh_aggregate_cell(
  p_company_id uuid,
  p_role_id uuid,
  p_level text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count    integer;
  v_offer    integer;
  v_reject   integer;
  v_withdrew integer;
  v_ghosted  integer;
  v_pending  integer;
  v_wcount   numeric;
  v_median   numeric;
  v_mode_seq text[];
  v_top      jsonb;
BEGIN
  -- Volume + raw/weighted outcome buckets over the cell's live reports.
  SELECT
    count(*),
    count(*) FILTER (WHERE outcome = 'offer'),
    count(*) FILTER (WHERE outcome = 'reject'),
    count(*) FILTER (WHERE outcome = 'withdrew'),
    count(*) FILTER (WHERE outcome = 'ghosted'),
    count(*) FILTER (WHERE outcome = 'pending'),
    COALESCE(sum(w), 0)
  INTO v_count, v_offer, v_reject, v_withdrew, v_ghosted, v_pending, v_wcount
  FROM (
    SELECT r.outcome, report_trust_weight(r.evidence_verified) AS w
    FROM interview_reports r
    WHERE r.company_id = p_company_id
      AND r.canonical_role_id = p_role_id
      AND r.level = p_level
      AND r.status = 'active'
      AND r.deleted_at IS NULL
  ) s;

  -- Cell emptied → drop the row and stop.
  IF v_count = 0 THEN
    DELETE FROM aggregates_company_role_level
     WHERE company_id = p_company_id
       AND canonical_role_id = p_role_id
       AND level = p_level;
    RETURN;
  END IF;

  -- Median round count. LEFT JOIN so a 0-round report contributes n=0.
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n)
  INTO v_median
  FROM (
    SELECT count(rd.id) AS n
    FROM interview_reports r
    LEFT JOIN rounds rd ON rd.report_id = r.id
    WHERE r.company_id = p_company_id
      AND r.canonical_role_id = p_role_id
      AND r.level = p_level
      AND r.status = 'active'
      AND r.deleted_at IS NULL
    GROUP BY r.id
  ) rc;

  -- Modal ordered round-type sequence (arrays are sortable, so mode() works).
  -- 0-round reports produce no sequence row and don't sway the mode.
  SELECT mode() WITHIN GROUP (ORDER BY seq)
  INTO v_mode_seq
  FROM (
    SELECT array_agg(rd.round_type::text ORDER BY rd.order_index) AS seq
    FROM interview_reports r
    JOIN rounds rd ON rd.report_id = r.id
    WHERE r.company_id = p_company_id
      AND r.canonical_role_id = p_role_id
      AND r.level = p_level
      AND r.status = 'active'
      AND r.deleted_at IS NULL
    GROUP BY r.id
  ) sq;

  -- Top topics: one row per (topic) with raw count + trust-weighted count over
  -- every question_topics occurrence in the cell; keep the top 10 by weight.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'topic_id', tid,
        'slug', slug,
        'name', name,
        'count', cnt,
        'weighted_count', wcnt
      ) ORDER BY wcnt DESC, cnt DESC, name ASC
    ) FILTER (WHERE rn <= 10),
    '[]'::jsonb
  )
  INTO v_top
  FROM (
    SELECT
      t.id   AS tid,
      t.slug AS slug,
      t.name AS name,
      count(*) AS cnt,
      sum(report_trust_weight(r.evidence_verified)) AS wcnt,
      row_number() OVER (
        ORDER BY sum(report_trust_weight(r.evidence_verified)) DESC,
                 count(*) DESC,
                 t.name ASC
      ) AS rn
    FROM interview_reports r
    JOIN rounds rd          ON rd.report_id = r.id
    JOIN questions q        ON q.round_id = rd.id
    JOIN question_topics qt ON qt.question_id = q.id
    JOIN topics t           ON t.id = qt.topic_id
    WHERE r.company_id = p_company_id
      AND r.canonical_role_id = p_role_id
      AND r.level = p_level
      AND r.status = 'active'
      AND r.deleted_at IS NULL
    GROUP BY t.id, t.slug, t.name
  ) tf;

  INSERT INTO aggregates_company_role_level AS a (
    company_id, canonical_role_id, level, report_count,
    outcome_offer, outcome_reject, outcome_withdrew, outcome_ghosted, outcome_pending,
    trust_weighted_count, median_round_count, mode_round_sequence, top_topics, refreshed_at
  ) VALUES (
    p_company_id, p_role_id, p_level, v_count,
    v_offer, v_reject, v_withdrew, v_ghosted, v_pending,
    v_wcount, v_median, v_mode_seq, v_top, now()
  )
  ON CONFLICT (company_id, canonical_role_id, level) DO UPDATE SET
    report_count         = EXCLUDED.report_count,
    outcome_offer        = EXCLUDED.outcome_offer,
    outcome_reject       = EXCLUDED.outcome_reject,
    outcome_withdrew     = EXCLUDED.outcome_withdrew,
    outcome_ghosted      = EXCLUDED.outcome_ghosted,
    outcome_pending      = EXCLUDED.outcome_pending,
    trust_weighted_count = EXCLUDED.trust_weighted_count,
    median_round_count   = EXCLUDED.median_round_count,
    mode_round_sequence  = EXCLUDED.mode_round_sequence,
    top_topics           = EXCLUDED.top_topics,
    refreshed_at         = EXCLUDED.refreshed_at;
END;
$$;
--> statement-breakpoint

-- Full backfill / reconciliation. Drops cells with no live reports, then
-- refreshes every distinct live cell. Returns the number of cells refreshed.
-- pnpm backfill:aggregates (Sprint 3 Day 6) calls this.
CREATE OR REPLACE FUNCTION refresh_all_aggregates()
  RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_cell record;
  v_n integer := 0;
BEGIN
  DELETE FROM aggregates_company_role_level a
  WHERE NOT EXISTS (
    SELECT 1 FROM interview_reports r
    WHERE r.company_id = a.company_id
      AND r.canonical_role_id = a.canonical_role_id
      AND r.level = a.level
      AND r.status = 'active'
      AND r.deleted_at IS NULL
  );

  FOR v_cell IN
    SELECT DISTINCT company_id, canonical_role_id, level
    FROM interview_reports
    WHERE status = 'active' AND deleted_at IS NULL
  LOOP
    PERFORM refresh_aggregate_cell(
      v_cell.company_id, v_cell.canonical_role_id, v_cell.level
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;
