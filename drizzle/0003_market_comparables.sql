CREATE TABLE "market_comparables" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"type" text NOT NULL,
	"price" double precision NOT NULL,
	"area_m2" double precision NOT NULL,
	"date" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"microzone_id" text,
	"condition" text DEFAULT 'unknown' NOT NULL,
	"asset_use" text DEFAULT 'residential' NOT NULL,
	"floor" integer,
	"elevator" boolean,
	"exterior" boolean,
	"label" text,
	"reference" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_comparables" ADD CONSTRAINT "market_comparables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_comparables" ADD CONSTRAINT "market_comparables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_comparables_org_zone" ON "market_comparables" USING btree ("organization_id","microzone_id");--> statement-breakpoint
CREATE INDEX "market_comparables_org_latlng" ON "market_comparables" USING btree ("organization_id","lat","lng");