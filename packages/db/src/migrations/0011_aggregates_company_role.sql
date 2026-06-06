-- Sprint 4 amendment (role-primary browse): per-(company, role) aggregate.
--
-- ⚠️  Source of truth for review/readability. The IDENTICAL statements are
--     applied by migration src/migrations/0011_aggregates_company_role.sql
--     (the migrator only reads src/migrations/). tests/aggregates.test.ts
--     asserts these two files don't drift. Edit BOTH, or just the migration
--     and re-copy here.
--
-- WHY THIS GRAIN EXISTS:
--   Users frequently skip the level field at submit (it stores the "Unspecified"
--   sentinel, null FK), and leveled reports fragment into thin (company, role,
--   level) cells. So the ROLE page — not the level cell — is the primary
--   aggregated unit: its Position-Y reads this table, computed over ALL of a
--   (company, role)'s live reports (every level AND the Unspecified ones).
--   Mirrors aggregates_company_role_level (migration 0008) with the level
--   dimension dropped; reuses report_trust_weight() and the same visibility
--   filter (status='active' AND deleted_at IS NULL).
--
-- THIS MIGRATION ALSO SUPERSEDES two level-grain functions from 0008
-- (CREATE OR REPLACE, so 0008 + its view stay byte-identical/untouched):
--   - refresh_aggregate_cell() now refuses the Unspecified/N/A sentinel level,
--     so a skipped-level report never forms a phantom "Unspecified" level cell.
--   - refresh_all_aggregates() skips the sentinel in its level loop AND drives
--     the role-grain backfill in the same pass (so existing callers — the seed
--     runner, pnpm backfill:aggregates — populate both grains with no change).

CREATE TABLE IF NOT EXISTS aggregates_company_role (
  -- Cell key: the role page's dims (company_id, role_id). No level axis.
  company_id uuid NOT NULL,
  canonical_role_id uuid NOT NULL,
  -- Volume over the whole role (all levels + Unspecified).
  report_count integer NOT NULL,
  outcome_offer integer NOT NULL DEFAULT 0,
  outcome_reject integer NOT NULL DEFAULT 0,
  outcome_withdrew integer NOT NULL DEFAULT 0,
  outcome_ghosted integer NOT NULL DEFAULT 0,
  outcome_pending integer NOT NULL DEFAULT 0,
  trust_weighted_count numeric NOT NULL DEFAULT 0,
  median_round_count numeric,
  mode_round_sequence text[],
  top_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, canonical_role_id)
);
--> statement-breakpoint

-- Recompute exactly one (company, role) cell from the base tables and UPSERT it.
-- Spans every level (incl. Unspecified). Drops the row when the role has no live
-- reports left. Idempotent. Mirror of refresh_aggregate_cell minus the level.
CREATE OR REPLACE FUNCTION refresh_aggregate_role(
  p_company_id uuid,
  p_role_id uuid
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
      AND r.status = 'active'
      AND r.deleted_at IS NULL
  ) s;

  IF v_count = 0 THEN
    DELETE FROM aggregates_company_role
     WHERE company_id = p_company_id
       AND canonical_role_id = p_role_id;
    RETURN;
  END IF;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n)
  INTO v_median
  FROM (
    SELECT count(rd.id) AS n
    FROM interview_reports r
    LEFT JOIN rounds rd ON rd.report_id = r.id
    WHERE r.company_id = p_company_id
      AND r.canonical_role_id = p_role_id
      AND r.status = 'active'
      AND r.deleted_at IS NULL
    GROUP BY r.id
  ) rc;

  SELECT mode() WITHIN GROUP (ORDER BY seq)
  INTO v_mode_seq
  FROM (
    SELECT array_agg(rd.round_type::text ORDER BY rd.order_index) AS seq
    FROM interview_reports r
    JOIN rounds rd ON rd.report_id = r.id
    WHERE r.company_id = p_company_id
      AND r.canonical_role_id = p_role_id
      AND r.status = 'active'
      AND r.deleted_at IS NULL
    GROUP BY r.id
  ) sq;

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
      AND r.status = 'active'
      AND r.deleted_at IS NULL
    GROUP BY t.id, t.slug, t.name
  ) tf;

  INSERT INTO aggregates_company_role AS a (
    company_id, canonical_role_id, report_count,
    outcome_offer, outcome_reject, outcome_withdrew, outcome_ghosted, outcome_pending,
    trust_weighted_count, median_round_count, mode_round_sequence, top_topics, refreshed_at
  ) VALUES (
    p_company_id, p_role_id, v_count,
    v_offer, v_reject, v_withdrew, v_ghosted, v_pending,
    v_wcount, v_median, v_mode_seq, v_top, now()
  )
  ON CONFLICT (company_id, canonical_role_id) DO UPDATE SET
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

-- Full role-grain backfill / reconciliation. Drops roles with no live reports,
-- then refreshes every distinct live (company, role). Returns the count.
CREATE OR REPLACE FUNCTION refresh_all_role_aggregates()
  RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_cell record;
  v_n integer := 0;
BEGIN
  DELETE FROM aggregates_company_role a
  WHERE NOT EXISTS (
    SELECT 1 FROM interview_reports r
    WHERE r.company_id = a.company_id
      AND r.canonical_role_id = a.canonical_role_id
      AND r.status = 'active'
      AND r.deleted_at IS NULL
  );

  FOR v_cell IN
    SELECT DISTINCT company_id, canonical_role_id
    FROM interview_reports
    WHERE status = 'active' AND deleted_at IS NULL
  LOOP
    PERFORM refresh_aggregate_role(v_cell.company_id, v_cell.canonical_role_id);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;
--> statement-breakpoint

-- Supersede the level-grain cell refresh (0008): refuse the Unspecified/N/A
-- sentinel so a skipped-level report never forms a phantom "level" cell. Body is
-- otherwise byte-for-byte the 0008 definition.
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
  -- The level grain is keyed on a REAL level. A skipped-level report carries the
  -- Unspecified/N/A sentinel (null FK) — it has no level page and must not form a
  -- level cell. Drop any stale sentinel row and stop; it lives only in the role
  -- grain (aggregates_company_role).
  IF p_level IN ('N/A', 'Unspecified') THEN
    DELETE FROM aggregates_company_role_level
     WHERE company_id = p_company_id
       AND canonical_role_id = p_role_id
       AND level = p_level;
    RETURN;
  END IF;

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

  IF v_count = 0 THEN
    DELETE FROM aggregates_company_role_level
     WHERE company_id = p_company_id
       AND canonical_role_id = p_role_id
       AND level = p_level;
    RETURN;
  END IF;

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

-- Supersede the full level backfill (0008): skip the sentinel level in the level
-- loop, and drive the role-grain backfill in the same pass. Returns the number
-- of LEVEL cells refreshed (unchanged contract; role cells are a side effect).
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
      AND level NOT IN ('N/A', 'Unspecified')
  LOOP
    PERFORM refresh_aggregate_cell(
      v_cell.company_id, v_cell.canonical_role_id, v_cell.level
    );
    v_n := v_n + 1;
  END LOOP;

  -- Keep the role grain in lockstep on every full backfill.
  PERFORM refresh_all_role_aggregates();

  RETURN v_n;
END;
$$;
