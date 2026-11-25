-- Two active reservations can never hold the same table at overlapping times,
-- even when requests race (the Go API relied on one global mutex for this).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservation_tables"
  ADD CONSTRAINT "reservation_tables_no_overlap"
  EXCLUDE USING gist ("table_id" WITH =, "blocks" WITH &&) WHERE ("active");
