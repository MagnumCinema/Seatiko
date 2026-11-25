CREATE TABLE "open_place_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp(6) with time zone NOT NULL,
	"finished_at" timestamp(6) with time zone,
	"status" text NOT NULL,
	"cities" text[] DEFAULT '{}' NOT NULL,
	"osm_count" integer DEFAULT 0 NOT NULL,
	"overture_count" integer DEFAULT 0 NOT NULL,
	"place_count" integer DEFAULT 0 NOT NULL,
	"overture_release" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_places" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address" jsonb NOT NULL,
	"category" text NOT NULL,
	"cuisine" text[] DEFAULT '{}' NOT NULL,
	"opening_hours" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"osm_id" text,
	"overture_id" text,
	"sources" text[] DEFAULT '{}' NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"venue_id" text,
	"seen_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "open_places" ADD CONSTRAINT "open_places_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_places_lat_lng_index" ON "open_places" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "open_places_venue_id_index" ON "open_places" USING btree ("venue_id");