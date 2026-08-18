DO $$ BEGIN
	CREATE TYPE "public"."skill_source" AS ENUM('bundled', 'imported', 'user');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_skills" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" varchar(80) DEFAULT 'general' NOT NULL,
	"triggers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"example_prompt" text,
	"preview" varchar(20),
	"source" "skill_source" DEFAULT 'bundled' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"default_artifact" varchar(32),
	"system_prompt" text DEFAULT '' NOT NULL,
	"origin" varchar(80),
	"origin_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_skills_category_index" ON "studio_skills" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_skills_source_index" ON "studio_skills" USING btree ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_skills_enabled_index" ON "studio_skills" USING btree ("enabled");
