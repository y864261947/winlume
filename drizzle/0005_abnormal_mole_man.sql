CREATE TYPE "public"."enterprise_billing_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "enterprise_billing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"tax_id" varchar(64),
	"contact_name" varchar(120) NOT NULL,
	"contact_email" varchar(320) NOT NULL,
	"contact_phone" varchar(40),
	"estimated_monthly_spend_credits" numeric,
	"notes" text,
	"status" "enterprise_billing_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enterprise_billing_requests" ADD CONSTRAINT "enterprise_billing_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_billing_requests" ADD CONSTRAINT "enterprise_billing_requests_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_billing_requests" ADD CONSTRAINT "enterprise_billing_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprise_billing_requests_organization_index" ON "enterprise_billing_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "enterprise_billing_requests_status_index" ON "enterprise_billing_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enterprise_billing_requests_organization_created_index" ON "enterprise_billing_requests" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_billing_requests_organization_pending_unique" ON "enterprise_billing_requests" USING btree ("organization_id") WHERE "enterprise_billing_requests"."status" = 'pending';