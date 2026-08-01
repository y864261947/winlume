CREATE TYPE "public"."payment_order_status" AS ENUM('pending', 'paid', 'failed', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_provider_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."subscription_interval" AS ENUM('month', 'year', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_provider_id" uuid NOT NULL,
	"subscription_id" uuid,
	"order_reference" varchar(255) NOT NULL,
	"external_reference" varchar(255),
	"status" "payment_order_status" DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"credits_microcredits" bigint DEFAULT 0 NOT NULL,
	"idempotency_key" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" "payment_provider_status" DEFAULT 'active' NOT NULL,
	"configuration_ciphertext" text,
	"webhook_secret_ciphertext" text,
	"supported_currencies" text[] DEFAULT ARRAY['USD']::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"interval" "subscription_interval" DEFAULT 'month' NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"payment_provider_id" uuid,
	"external_subscription_id" varchar(255),
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_payment_provider_id_payment_providers_id_fk" FOREIGN KEY ("payment_provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_provider_id_payment_providers_id_fk" FOREIGN KEY ("payment_provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_order_reference_unique" ON "payment_orders" USING btree ("order_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_provider_external_unique" ON "payment_orders" USING btree ("payment_provider_id","external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_user_idempotency_unique" ON "payment_orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_orders_user_status_index" ON "payment_orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_providers_slug_unique" ON "payment_providers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "payment_providers_status_index" ON "payment_providers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_code_unique" ON "subscription_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscription_plans_active_index" ON "subscription_plans" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_external_unique" ON "subscriptions" USING btree ("payment_provider_id","external_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_index" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_index" ON "subscriptions" USING btree ("current_period_end");