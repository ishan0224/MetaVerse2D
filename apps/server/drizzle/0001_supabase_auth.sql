ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
UPDATE "users"
SET "auth_user_id" = "id"
WHERE "auth_user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "auth_user_id" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_auth_user_id_unique_idx" ON "users" USING btree ("auth_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_idx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
