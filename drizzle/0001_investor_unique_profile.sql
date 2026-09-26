-- One Investor DNA profile per (organization, user). Remove duplicates first, keeping the newest.
DELETE FROM "investor_profiles" a
USING "investor_profiles" b
WHERE a."organization_id" = b."organization_id"
  AND a."user_id" = b."user_id"
  AND (a."updated_at" < b."updated_at" OR (a."updated_at" = b."updated_at" AND a."id" < b."id"));--> statement-breakpoint
DROP INDEX "investor_profiles_org_user";--> statement-breakpoint
CREATE UNIQUE INDEX "investor_profiles_org_user" ON "investor_profiles" USING btree ("organization_id","user_id");--> statement-breakpoint
-- properties.location was created without an SRID; the schema declares WGS84 (4326).
ALTER TABLE "properties" ALTER COLUMN "location" TYPE geometry(Point, 4326) USING ST_SetSRID("location", 4326);
