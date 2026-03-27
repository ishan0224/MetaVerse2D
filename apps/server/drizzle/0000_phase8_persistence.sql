CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_state" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "x" double precision NOT NULL,
  "y" double precision NOT NULL,
  "world_id" text NOT NULL,
  "room_id" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "player_state"
    ADD CONSTRAINT "player_state_user_id_users_id_fk"
    FOREIGN KEY ("user_id")
    REFERENCES "public"."users"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_state_updated_at_idx" ON "player_state" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_state_world_room_idx" ON "player_state" USING btree ("world_id","room_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique_idx" ON "users" USING btree ("username");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_username_idx" ON "users" USING btree ("username");
