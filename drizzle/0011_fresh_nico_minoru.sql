CREATE TYPE "public"."epay_order_status" AS ENUM('pending', 'crediting', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "epay_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_no" varchar(64) NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"new_api_user_id" integer NOT NULL,
	"provider" varchar(32) DEFAULT 'epay' NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"amount_credits" integer NOT NULL,
	"pay_money" varchar(32) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"status" "epay_order_status" DEFAULT 'pending' NOT NULL,
	"epay_trade_no" varchar(128),
	"quota_granted" integer,
	"notify_payload" jsonb,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "epay_orders" ADD CONSTRAINT "epay_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epay_orders" ADD CONSTRAINT "epay_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "epay_orders_trade_no_unique" ON "epay_orders" USING btree ("trade_no");--> statement-breakpoint
CREATE INDEX "epay_orders_organization_index" ON "epay_orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "epay_orders_user_index" ON "epay_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "epay_orders_status_index" ON "epay_orders" USING btree ("status");