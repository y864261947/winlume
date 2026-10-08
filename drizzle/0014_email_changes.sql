CREATE TABLE "email_changes" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "previous_email" varchar(320),
  "auth_version" integer NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "previous_code_hash" varchar(64),
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
