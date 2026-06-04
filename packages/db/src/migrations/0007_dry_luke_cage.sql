CREATE TYPE "public"."level_tier" AS ENUM('junior', 'mid', 'senior', 'staff', 'senior_staff', 'principal');--> statement-breakpoint
ALTER TABLE "company_levels" ADD COLUMN "tier" "level_tier";