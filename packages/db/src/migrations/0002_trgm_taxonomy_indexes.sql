-- Sprint 1 Day 3: pg_trgm-backed fuzzy lookup for taxonomy autocomplete.
--
-- These objects are intentionally NOT declared in the Drizzle schema:
-- drizzle-kit can't represent CREATE EXTENSION / CREATE FUNCTION, and the
-- alias indexes are expression indexes drizzle-kit doesn't model. They're
-- pure performance objects — query correctness doesn't depend on them — so
-- they live here and are asserted by migration.test.ts against the pg
-- catalog, not against the schema snapshot. drizzle-kit generate diffs
-- schema vs. its meta snapshot (never the live DB), so it won't drop them.
--
-- gin_trgm_ops accelerates BOTH the `%` similarity operator and ILIKE/LIKE,
-- which is exactly the hybrid (fuzzy + substring) match searchCompanies/
-- searchRoles run. The whole WHERE stays index-able as the taxonomy grows
-- past the seeded 30/20 rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- array_to_string() is only STABLE (its output can vary with the element
-- type's output function), so Postgres rejects it directly in an index
-- expression ("functions in index expression must be marked IMMUTABLE").
-- For a text[] input with a constant delimiter the result IS deterministic,
-- so we wrap it in an IMMUTABLE SQL function — the standard pg_trgm-on-array
-- pattern. The search queries call this same function so the planner can
-- match the expression to the index.
CREATE OR REPLACE FUNCTION taxonomy_aliases_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string($1, ' ') $$;
--> statement-breakpoint
CREATE INDEX "companies_name_trgm_idx" ON "companies" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "companies_aliases_trgm_idx" ON "companies" USING gin (taxonomy_aliases_text("aliases") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "roles_name_trgm_idx" ON "roles" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "roles_aliases_trgm_idx" ON "roles" USING gin (taxonomy_aliases_text("aliases") gin_trgm_ops);
