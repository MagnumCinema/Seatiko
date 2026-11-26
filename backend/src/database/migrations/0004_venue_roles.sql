CREATE TABLE "venue_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"in_schedule" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "venue_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "venue_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_roles_venue_id_key_index" ON "venue_roles" USING btree ("venue_id","key");--> statement-breakpoint
-- Demo venues get their format; roles are seeded per venue on first use (VenueRolesService.ensure).
UPDATE "venues" SET "venue_type" = CASE "id"
	WHEN 'venue-1' THEN 'restaurant' WHEN 'venue-2' THEN 'cafe' WHEN 'venue-3' THEN 'restaurant' WHEN 'venue-4' THEN 'pizzeria'
	WHEN 'venue-5' THEN 'pub' WHEN 'venue-6' THEN 'restaurant' WHEN 'venue-7' THEN 'fast_food' WHEN 'venue-8' THEN 'bar'
	WHEN 'venue-9' THEN 'wine_bar' WHEN 'venue-10' THEN 'pizzeria' WHEN 'venue-11' THEN 'restaurant' WHEN 'venue-12' THEN 'restaurant'
	WHEN 'venue-13' THEN 'bakery' WHEN 'venue-14' THEN 'restaurant' ELSE "venue_type" END
WHERE "venue_type" = '';--> statement-breakpoint
UPDATE "applications" SET "venue_type" = "venues"."venue_type" FROM "venues"
WHERE "applications"."venue_id" = "venues"."id" AND "applications"."venue_type" = '';
