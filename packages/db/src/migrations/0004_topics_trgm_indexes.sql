-- Sprint 2 Day 1: pg_trgm-backed fuzzy lookup for the topic-tag taxonomy.
--
-- Mirror of migration 0002 for the `topics` table: the tag combobox
-- (Sprint 2 Day 3) reuses the Sprint 1 <Combobox> and points its async
-- search at searchTopics, which runs the same hybrid (fuzzy `%` + substring
-- ILIKE) match over name + aliases that searchCompanies/searchRoles do.
-- gin_trgm_ops keeps that WHERE index-able as the curated ~80 tags grow with
-- user-suggested additions.
--
-- Same caveat as 0002: these objects are NOT in the Drizzle schema —
-- drizzle-kit can't model gin_trgm_ops expression indexes, so they live here
-- and are asserted by migration.test.ts against the pg catalog. The pg_trgm
-- extension and taxonomy_aliases_text() IMMUTABLE wrapper already exist
-- (created in 0002); we only add the two topic indexes here.
CREATE INDEX "topics_name_trgm_idx" ON "topics" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "topics_aliases_trgm_idx" ON "topics" USING gin (taxonomy_aliases_text("aliases") gin_trgm_ops);
