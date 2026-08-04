CREATE TYPE "public"."funding_preference" AS ENUM('subscription_first', 'wallet_first', 'subscription_only', 'wallet_only');--> statement-breakpoint
CREATE TYPE "public"."pricing_catalog_state" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."pricing_mode" AS ENUM('ratio', 'fixed', 'tiered_expr');--> statement-breakpoint
CREATE TYPE "public"."subscription_quota_ledger_entry_type" AS ENUM('hold', 'release', 'debit', 'refund', 'reset', 'adjustment');--> statement-breakpoint
ALTER TYPE "public"."usage_event_status" ADD VALUE 'settlement_pending' BEFORE 'settled';--> statement-breakpoint
CREATE TABLE "api_key_billing_policies" (
	"api_key_id" uuid PRIMARY KEY NOT NULL,
	"user_group" varchar(120) DEFAULT 'default' NOT NULL,
	"billing_group" varchar(120) DEFAULT 'default' NOT NULL,
	"unlimited" boolean DEFAULT false NOT NULL,
	"quota_limit" bigint,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_billing_policies_limit_check" CHECK (("api_key_billing_policies"."unlimited" = true AND "api_key_billing_policies"."quota_limit" IS NULL) OR ("api_key_billing_policies"."unlimited" = false AND "api_key_billing_policies"."quota_limit" IS NOT NULL AND "api_key_billing_policies"."quota_limit" >= 0))
);
--> statement-breakpoint
CREATE TABLE "api_key_quota_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"usage_event_id" uuid,
	"entry_type" "ledger_entry_type" NOT NULL,
	"quota_delta" bigint NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"reference" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_quota_ledger_entries_nonzero_delta" CHECK ("api_key_quota_ledger_entries"."quota_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "billing_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_group" varchar(120) DEFAULT 'default' NOT NULL,
	"funding_preference" "funding_preference" DEFAULT 'subscription_first' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_shadow_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"api_key_id" uuid,
	"usage_event_id" uuid,
	"catalog_version_id" uuid NOT NULL,
	"model" varchar(255) NOT NULL,
	"canonical_usage" jsonb NOT NULL,
	"usage_provenance" jsonb NOT NULL,
	"pricing_quote" jsonb NOT NULL,
	"calculated_reservation_quota" bigint NOT NULL,
	"calculated_actual_quota" bigint,
	"reference_quota" bigint,
	"quota_delta" bigint,
	"outcome" varchar(64) NOT NULL,
	"mismatch_class" varchar(128),
	"completion_state" varchar(64),
	"sanitized_error_class" varchar(128),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_shadow_events_reservation_nonnegative" CHECK ("billing_shadow_events"."calculated_reservation_quota" >= 0),
	CONSTRAINT "billing_shadow_events_actual_nonnegative" CHECK ("billing_shadow_events"."calculated_actual_quota" IS NULL OR "billing_shadow_events"."calculated_actual_quota" >= 0),
	CONSTRAINT "billing_shadow_events_reference_nonnegative" CHECK ("billing_shadow_events"."reference_quota" IS NULL OR "billing_shadow_events"."reference_quota" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gateway_relay_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usage_event_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"channel_id" varchar(255) NOT NULL,
	"provider_type" integer NOT NULL,
	"status" varchar(64) NOT NULL,
	"retry_reason" varchar(128),
	"sanitized_error_class" varchar(128),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_relay_attempts_number_positive" CHECK ("gateway_relay_attempts"."attempt_number" > 0),
	CONSTRAINT "gateway_relay_attempts_provider_type_nonnegative" CHECK ("gateway_relay_attempts"."provider_type" >= 0),
	CONSTRAINT "gateway_relay_attempts_completion_after_start" CHECK ("gateway_relay_attempts"."completed_at" IS NULL OR "gateway_relay_attempts"."completed_at" >= "gateway_relay_attempts"."started_at")
);
--> statement-breakpoint
CREATE TABLE "model_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"model" varchar(255) NOT NULL,
	"billing_group" varchar(120) NOT NULL,
	"provider_type" integer NOT NULL,
	"protocol_family" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"priority_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_availability_selection_nonnegative_check" CHECK ("model_availability"."provider_type" >= 0 AND "model_availability"."priority" >= 0 AND "model_availability"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pricing_catalog_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_kind" varchar(64) NOT NULL,
	"source_instance_label" varchar(120) NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"algorithm_version" varchar(64) NOT NULL,
	"quota_per_unit" numeric NOT NULL,
	"pre_consumed_tokens" bigint NOT NULL,
	"state" "pricing_catalog_state" DEFAULT 'draft' NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_catalog_versions_quota_positive" CHECK ("pricing_catalog_versions"."quota_per_unit" > 0),
	CONSTRAINT "pricing_catalog_versions_preconsume_nonnegative" CHECK ("pricing_catalog_versions"."pre_consumed_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pricing_group_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"user_group" varchar(120) NOT NULL,
	"billing_group" varchar(120) NOT NULL,
	"group_ratio" numeric NOT NULL,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_group_rules_ratio_nonnegative" CHECK ("pricing_group_rules"."group_ratio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pricing_model_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"model_key" varchar(255) NOT NULL,
	"mode" "pricing_mode" NOT NULL,
	"model_ratio" numeric,
	"fixed_price_usd" numeric,
	"completion_ratio" numeric,
	"cache_read_ratio" numeric,
	"cache_write_ratio" numeric,
	"cache_write_one_hour_ratio" numeric,
	"image_ratio" numeric,
	"audio_input_ratio" numeric,
	"audio_completion_ratio" numeric,
	"tiered_expression" text,
	"tiered_expression_hash" varchar(64),
	"tiered_expression_version" varchar(64),
	"tool_prices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled_groups" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"protocol_families" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"rule_hash" varchar(64) NOT NULL,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_model_rules_mode_value_check" CHECK (("pricing_model_rules"."mode" = 'ratio' AND "pricing_model_rules"."model_ratio" IS NOT NULL) OR ("pricing_model_rules"."mode" = 'fixed' AND "pricing_model_rules"."fixed_price_usd" IS NOT NULL) OR ("pricing_model_rules"."mode" = 'tiered_expr' AND "pricing_model_rules"."tiered_expression" IS NOT NULL AND "pricing_model_rules"."tiered_expression_hash" IS NOT NULL AND "pricing_model_rules"."tiered_expression_version" IS NOT NULL)),
	CONSTRAINT "pricing_model_rules_nonnegative_check" CHECK (COALESCE("pricing_model_rules"."model_ratio", 0) >= 0 AND COALESCE("pricing_model_rules"."fixed_price_usd", 0) >= 0 AND COALESCE("pricing_model_rules"."completion_ratio", 0) >= 0 AND COALESCE("pricing_model_rules"."cache_read_ratio", 0) >= 0 AND COALESCE("pricing_model_rules"."cache_write_ratio", 0) >= 0 AND COALESCE("pricing_model_rules"."cache_write_one_hour_ratio", 0) >= 0 AND COALESCE("pricing_model_rules"."image_ratio", 0) >= 0 AND COALESCE("pricing_model_rules"."audio_input_ratio", 0) >= 0 AND COALESCE("pricing_model_rules"."audio_completion_ratio", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_quota_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"usage_event_id" uuid,
	"entry_type" "subscription_quota_ledger_entry_type" NOT NULL,
	"quota_delta" bigint NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"reference" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_quota_ledger_entries_nonzero_delta" CHECK ("subscription_quota_ledger_entries"."quota_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_quota_states" (
	"subscription_id" uuid PRIMARY KEY NOT NULL,
	"reset_window_started_at" timestamp with time zone NOT NULL,
	"reset_window_ends_at" timestamp with time zone NOT NULL,
	"next_reset_at" timestamp with time zone NOT NULL,
	"window_quota_limit" bigint,
	"window_quota_consumed" bigint DEFAULT 0 NOT NULL,
	"cumulative_quota_limit" bigint,
	"cumulative_quota_consumed" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_quota_states_reset_window_order" CHECK ("subscription_quota_states"."reset_window_ends_at" > "subscription_quota_states"."reset_window_started_at" AND "subscription_quota_states"."next_reset_at" >= "subscription_quota_states"."reset_window_ends_at"),
	CONSTRAINT "subscription_quota_states_limits_nonnegative" CHECK (("subscription_quota_states"."window_quota_limit" IS NULL OR "subscription_quota_states"."window_quota_limit" >= 0) AND ("subscription_quota_states"."cumulative_quota_limit" IS NULL OR "subscription_quota_states"."cumulative_quota_limit" >= 0)),
	CONSTRAINT "subscription_quota_states_consumed_nonnegative" CHECK ("subscription_quota_states"."window_quota_consumed" >= 0 AND "subscription_quota_states"."cumulative_quota_consumed" >= 0),
	CONSTRAINT "subscription_quota_states_consumed_within_limits" CHECK (("subscription_quota_states"."window_quota_limit" IS NULL OR "subscription_quota_states"."window_quota_consumed" <= "subscription_quota_states"."window_quota_limit") AND ("subscription_quota_states"."cumulative_quota_limit" IS NULL OR "subscription_quota_states"."cumulative_quota_consumed" <= "subscription_quota_states"."cumulative_quota_limit"))
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "catalog_version_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "canonical_usage" jsonb;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "usage_provenance" jsonb;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "completion_state" varchar(64);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "stream_end_reason" varchar(128);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "funding_kind" varchar(32);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "funding_reference" varchar(255);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "reserved_quota" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "actual_quota" bigint;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "settlement_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "channel_cost_quota" bigint;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "profit_quota" bigint;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "operation_id" varchar(255);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "completion_snapshot_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_key_billing_policies" ADD CONSTRAINT "api_key_billing_policies_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_quota_ledger_entries" ADD CONSTRAINT "api_key_quota_ledger_entries_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_quota_ledger_entries" ADD CONSTRAINT "api_key_quota_ledger_entries_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_shadow_events" ADD CONSTRAINT "billing_shadow_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_shadow_events" ADD CONSTRAINT "billing_shadow_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_shadow_events" ADD CONSTRAINT "billing_shadow_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_shadow_events" ADD CONSTRAINT "billing_shadow_events_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_shadow_events" ADD CONSTRAINT "billing_shadow_events_catalog_version_id_pricing_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."pricing_catalog_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_relay_attempts" ADD CONSTRAINT "gateway_relay_attempts_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_availability" ADD CONSTRAINT "model_availability_catalog_version_id_pricing_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."pricing_catalog_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_group_rules" ADD CONSTRAINT "pricing_group_rules_catalog_version_id_pricing_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."pricing_catalog_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_model_rules" ADD CONSTRAINT "pricing_model_rules_catalog_version_id_pricing_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."pricing_catalog_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_quota_ledger_entries" ADD CONSTRAINT "subscription_quota_ledger_entries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_quota_ledger_entries" ADD CONSTRAINT "subscription_quota_ledger_entries_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_quota_states" ADD CONSTRAINT "subscription_quota_states_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_quota_ledger_entries_key_idempotency_unique" ON "api_key_quota_ledger_entries" USING btree ("api_key_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "api_key_quota_ledger_entries_key_created_index" ON "api_key_quota_ledger_entries" USING btree ("api_key_id","created_at");--> statement-breakpoint
CREATE INDEX "api_key_quota_ledger_entries_usage_event_index" ON "api_key_quota_ledger_entries" USING btree ("usage_event_id");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_request_id_index" ON "billing_shadow_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_model_index" ON "billing_shadow_events" USING btree ("model");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_outcome_index" ON "billing_shadow_events" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_mismatch_class_index" ON "billing_shadow_events" USING btree ("mismatch_class");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_created_id_index" ON "billing_shadow_events" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_user_index" ON "billing_shadow_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_organization_index" ON "billing_shadow_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_api_key_index" ON "billing_shadow_events" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_usage_event_index" ON "billing_shadow_events" USING btree ("usage_event_id");--> statement-breakpoint
CREATE INDEX "billing_shadow_events_catalog_version_index" ON "billing_shadow_events" USING btree ("catalog_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_relay_attempts_usage_attempt_unique" ON "gateway_relay_attempts" USING btree ("usage_event_id","attempt_number");--> statement-breakpoint
CREATE INDEX "gateway_relay_attempts_usage_created_index" ON "gateway_relay_attempts" USING btree ("usage_event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "model_availability_catalog_model_group_provider_unique" ON "model_availability" USING btree ("catalog_version_id","model","billing_group","provider_type");--> statement-breakpoint
CREATE INDEX "model_availability_catalog_index" ON "model_availability" USING btree ("catalog_version_id");--> statement-breakpoint
CREATE INDEX "model_availability_enabled_model_group_index" ON "model_availability" USING btree ("enabled","model","billing_group");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_catalog_versions_source_hash_unique" ON "pricing_catalog_versions" USING btree ("source_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_catalog_versions_single_active_unique" ON "pricing_catalog_versions" USING btree ("state") WHERE "pricing_catalog_versions"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_group_rules_catalog_groups_unique" ON "pricing_group_rules" USING btree ("catalog_version_id","user_group","billing_group");--> statement-breakpoint
CREATE INDEX "pricing_group_rules_catalog_index" ON "pricing_group_rules" USING btree ("catalog_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_model_rules_catalog_model_unique" ON "pricing_model_rules" USING btree ("catalog_version_id","model_key");--> statement-breakpoint
CREATE INDEX "pricing_model_rules_catalog_index" ON "pricing_model_rules" USING btree ("catalog_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_quota_ledger_entries_subscription_idempotency_unique" ON "subscription_quota_ledger_entries" USING btree ("subscription_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "subscription_quota_ledger_entries_subscription_created_index" ON "subscription_quota_ledger_entries" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_quota_ledger_entries_usage_event_index" ON "subscription_quota_ledger_entries" USING btree ("usage_event_id");--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_catalog_version_id_pricing_catalog_versions_id_fk" FOREIGN KEY ("catalog_version_id") REFERENCES "public"."pricing_catalog_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_operation_id_unique" ON "usage_events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "usage_events_organization_index" ON "usage_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_events_catalog_version_index" ON "usage_events" USING btree ("catalog_version_id");--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_reserved_quota_nonnegative" CHECK ("usage_events"."reserved_quota" >= 0);--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_actual_quota_nonnegative" CHECK ("usage_events"."actual_quota" IS NULL OR "usage_events"."actual_quota" >= 0);--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_settlement_attempt_count_nonnegative" CHECK ("usage_events"."settlement_attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_channel_cost_quota_nonnegative" CHECK ("usage_events"."channel_cost_quota" IS NULL OR "usage_events"."channel_cost_quota" >= 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gateway_quota_ledger_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'gateway quota ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "api_key_quota_ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "api_key_quota_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_gateway_quota_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "subscription_quota_ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "subscription_quota_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_gateway_quota_ledger_mutation"();
