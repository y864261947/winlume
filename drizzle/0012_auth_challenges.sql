CREATE TYPE "public"."auth_challenge_purpose" AS ENUM('signup', 'password_reset');--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "auth_challenge_purpose" NOT NULL,
	"email" varchar(320) NOT NULL,
	"username" varchar(64),
	"password_hash" varchar(255),
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_challenges_email_purpose_index" ON "auth_challenges" USING btree ("email","purpose");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_index" ON "auth_challenges" USING btree ("expires_at");
