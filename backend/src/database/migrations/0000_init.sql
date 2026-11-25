CREATE TABLE "event_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"event_type" text NOT NULL,
	"guest_count" integer NOT NULL,
	"preferred_date" timestamp(6) with time zone NOT NULL,
	"contact_method" text NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"admin_phone" text DEFAULT '' NOT NULL,
	"admin_telegram" text DEFAULT '' NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"order_id" text NOT NULL,
	"position" integer NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" jsonb NOT NULL,
	"qty" integer NOT NULL,
	"price" integer NOT NULL,
	"requires_age_18" boolean DEFAULT false NOT NULL,
	"contains_alcohol" boolean DEFAULT false NOT NULL,
	"age_check" text DEFAULT '' NOT NULL,
	CONSTRAINT "order_items_order_id_position_pk" PRIMARY KEY("order_id","position")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"user_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"preorder" boolean DEFAULT false NOT NULL,
	"reservation_id" text DEFAULT '' NOT NULL,
	"kitchen_at" timestamp(6) with time zone,
	"adult_items_removed_at" timestamp(6) with time zone,
	"status" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"check_number" text DEFAULT '' NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"paid_at" timestamp(6) with time zone,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_tables" (
	"reservation_id" text NOT NULL,
	"table_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"blocks" "tstzrange" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reservation_tables_reservation_id_table_id_pk" PRIMARY KEY("reservation_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"table_id" text NOT NULL,
	"guests" integer NOT NULL,
	"reserved_for" timestamp(6) with time zone NOT NULL,
	"duration_min" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"source" text DEFAULT 'WEB' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"arrival_confirmed_at" timestamp(6) with time zone,
	"expected_arrival" timestamp(6) with time zone,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"table_id" text NOT NULL,
	"reservation_id" text,
	"status" text NOT NULL,
	"started_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "table_watches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"table_id" text NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiter_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"table_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"guest_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"guests" integer NOT NULL,
	"zone" text DEFAULT 'hall' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"source" text DEFAULT 'APP' NOT NULL,
	"table_id" text DEFAULT '' NOT NULL,
	"quoted_wait" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp(6) with time zone,
	"seated_at" timestamp(6) with time zone,
	"closed_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"available" boolean DEFAULT false NOT NULL,
	"country" text DEFAULT 'MD' NOT NULL,
	"center" jsonb NOT NULL,
	"bounds" jsonb NOT NULL,
	CONSTRAINT "cities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"venue_ids" text[] DEFAULT '{}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"category" jsonb NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"ingredients" jsonb,
	"allergens" text[] DEFAULT '{}' NOT NULL,
	"price" integer NOT NULL,
	"weight_g" integer DEFAULT 0 NOT NULL,
	"volume_ml" integer DEFAULT 0 NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"contains_alcohol" boolean DEFAULT false NOT NULL,
	"requires_age_18" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"stopped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"number" integer NOT NULL,
	"seats" integer NOT NULL,
	"status" text DEFAULT 'FREE' NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"zone" text DEFAULT 'hall' NOT NULL,
	"occupied_since" timestamp(6) with time zone,
	"reserved_for" timestamp(6) with time zone,
	"reservation_id" text,
	"qr_token" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" text PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"cuisine" text[] DEFAULT '{}' NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"price_level" integer DEFAULT 0 NOT NULL,
	"address" jsonb NOT NULL,
	"lat" double precision DEFAULT 0 NOT NULL,
	"lng" double precision DEFAULT 0 NOT NULL,
	"average_check" integer DEFAULT 0 NOT NULL,
	"open_now" boolean DEFAULT true NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"photo_urls" text[] DEFAULT '{}' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"google_place_id" text DEFAULT '' NOT NULL,
	"reviews" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alcohol_license" boolean DEFAULT false NOT NULL,
	"session_start_before_min" integer DEFAULT 0 NOT NULL,
	"release_before_min" integer DEFAULT 0 NOT NULL,
	"booking_interval_min" integer DEFAULT 0 NOT NULL,
	"hold_minutes" integer DEFAULT 0 NOT NULL,
	"max_late_arrival_min" integer DEFAULT 0 NOT NULL,
	"visit_duration_min" integer DEFAULT 0 NOT NULL,
	"max_visit_duration_min" integer DEFAULT 0 NOT NULL,
	"allow_preorder" boolean DEFAULT false NOT NULL,
	"preorder_lead_min" integer DEFAULT 0 NOT NULL,
	"hours_text" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adult_permission_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"staff_id" text NOT NULL,
	"staff_role" text NOT NULL,
	"staff_display_name" text NOT NULL,
	"venue_id" text NOT NULL,
	"reservation_id" text DEFAULT '' NOT NULL,
	"id_document_checked" boolean DEFAULT false NOT NULL,
	"id_document_type" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"venue_id" text DEFAULT '' NOT NULL,
	"reservation_id" text DEFAULT '' NOT NULL,
	"order_id" text DEFAULT '' NOT NULL,
	"at" timestamp(6) with time zone,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"role" text DEFAULT 'guest' NOT NULL,
	"diet_preferences" text[] DEFAULT '{}' NOT NULL,
	"favorite_venues" text[] DEFAULT '{}' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"avatar_key" text DEFAULT '' NOT NULL,
	"adult_preorder_allowed" boolean DEFAULT false NOT NULL,
	"adult_verification" jsonb,
	"deleted_at" timestamp(6) with time zone,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"actor_user_id" text DEFAULT '' NOT NULL,
	"actor_role" text DEFAULT 'system' NOT NULL,
	"action" text NOT NULL,
	"changed_fields" text[] DEFAULT '{}' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"status" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"address" jsonb NOT NULL,
	"cuisine" text[] DEFAULT '{}' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"city_id" text DEFAULT '' NOT NULL,
	"lat" double precision DEFAULT 0 NOT NULL,
	"lng" double precision DEFAULT 0 NOT NULL,
	"price_level" integer DEFAULT 0 NOT NULL,
	"average_check" integer DEFAULT 0 NOT NULL,
	"photo_urls" text[] DEFAULT '{}' NOT NULL,
	"hours_text" text DEFAULT '' NOT NULL,
	"reject_reason" text DEFAULT '' NOT NULL,
	"venue_id" text,
	"booking_interval_min" integer DEFAULT 0 NOT NULL,
	"hold_minutes" integer DEFAULT 0 NOT NULL,
	"allow_preorder" boolean DEFAULT false NOT NULL,
	"session_start_before_min" integer DEFAULT 0 NOT NULL,
	"release_before_min" integer DEFAULT 0 NOT NULL,
	"max_late_arrival_min" integer DEFAULT 0 NOT NULL,
	"visit_duration_min" integer DEFAULT 0 NOT NULL,
	"max_visit_duration_min" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "profile_change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"status" text NOT NULL,
	"patch" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'waiter' NOT NULL,
	"status" text NOT NULL,
	"on_shift" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"staff_name" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_activities" ADD CONSTRAINT "application_activities_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_inquiries_user_id_index" ON "event_inquiries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_inquiries_venue_id_index" ON "event_inquiries" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "orders_user_id_index" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_venue_id_index" ON "orders" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "orders_reservation_id_index" ON "orders" USING btree ("reservation_id") WHERE "orders"."preorder";--> statement-breakpoint
CREATE INDEX "reservation_tables_table_id_index" ON "reservation_tables" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "reservations_user_id_index" ON "reservations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reservations_venue_id_reserved_for_index" ON "reservations" USING btree ("venue_id","reserved_for");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_venue_id_status_index" ON "sessions" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "waiter_calls_venue_id_status_index" ON "waiter_calls" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "waitlist_entries_venue_id_status_index" ON "waitlist_entries" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "menu_items_venue_id_index" ON "menu_items" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "tables_venue_id_index" ON "tables" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "venues_city_id_index" ON "venues" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "adult_permission_log_user_id_index" ON "adult_permission_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_index" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_role_index" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "application_activities_application_id_created_at_index" ON "application_activities" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_owner_user_id_index" ON "applications" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "applications_status_index" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "profile_change_requests_status_index" ON "profile_change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_members_venue_id_index" ON "staff_members" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "staff_members_user_id_index" ON "staff_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "work_shifts_venue_id_date_index" ON "work_shifts" USING btree ("venue_id","date");--> statement-breakpoint
CREATE INDEX "work_shifts_staff_id_index" ON "work_shifts" USING btree ("staff_id");