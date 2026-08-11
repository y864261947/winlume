CREATE TABLE "team_new_api_mapping" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"new_api_user_id" integer NOT NULL,
	"new_api_username" varchar(64) NOT NULL,
	"new_api_password_ciphertext" text NOT NULL,
	"new_api_pat_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key_billing_policies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_key_quota_ledger_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_profiles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_shadow_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channels" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enterprise_billing_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gateway_relay_attempts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "model_availability" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_providers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pricing_catalog_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pricing_group_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pricing_model_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_quota_ledger_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_quota_states" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_ledger_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "api_key_billing_policies" CASCADE;--> statement-breakpoint
DROP TABLE "api_key_quota_ledger_entries" CASCADE;--> statement-breakpoint
DROP TABLE "billing_profiles" CASCADE;--> statement-breakpoint
DROP TABLE "billing_shadow_events" CASCADE;--> statement-breakpoint
DROP TABLE "channels" CASCADE;--> statement-breakpoint
DROP TABLE "enterprise_billing_requests" CASCADE;--> statement-breakpoint
DROP TABLE "gateway_relay_attempts" CASCADE;--> statement-breakpoint
DROP TABLE "model_availability" CASCADE;--> statement-breakpoint
DROP TABLE "payment_orders" CASCADE;--> statement-breakpoint
DROP TABLE "payment_providers" CASCADE;--> statement-breakpoint
DROP TABLE "pricing_catalog_versions" CASCADE;--> statement-breakpoint
DROP TABLE "pricing_group_rules" CASCADE;--> statement-breakpoint
DROP TABLE "pricing_model_rules" CASCADE;--> statement-breakpoint
DROP TABLE "subscription_plans" CASCADE;--> statement-breakpoint
DROP TABLE "subscription_quota_ledger_entries" CASCADE;--> statement-breakpoint
DROP TABLE "subscription_quota_states" CASCADE;--> statement-breakpoint
DROP TABLE "subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "usage_events" CASCADE;--> statement-breakpoint
DROP TABLE "wallet_ledger_entries" CASCADE;--> statement-breakpoint
DROP TABLE "wallets" CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "new_api_token_id" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "new_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "is_studio_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "team_new_api_mapping" ADD CONSTRAINT "team_new_api_mapping_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_new_api_mapping_user_id_unique" ON "team_new_api_mapping" USING btree ("new_api_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_current_organization_id_organizations_id_fk" FOREIGN KEY ("current_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "quota_limit_microcredits";--> statement-breakpoint
DROP TYPE "public"."enterprise_billing_request_status";--> statement-breakpoint
DROP TYPE "public"."funding_preference";--> statement-breakpoint
DROP TYPE "public"."ledger_entry_type";--> statement-breakpoint
DROP TYPE "public"."payment_order_status";--> statement-breakpoint
DROP TYPE "public"."payment_provider_status";--> statement-breakpoint
DROP TYPE "public"."pricing_catalog_state";--> statement-breakpoint
DROP TYPE "public"."pricing_mode";--> statement-breakpoint
DROP TYPE "public"."subscription_interval";--> statement-breakpoint
DROP TYPE "public"."subscription_quota_ledger_entry_type";--> statement-breakpoint
DROP TYPE "public"."subscription_status";--> statement-breakpoint
DROP TYPE "public"."usage_event_status";