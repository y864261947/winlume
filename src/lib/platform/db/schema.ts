import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "pending"]);
export const platformRoleEnum = pgEnum("platform_role", ["user", "admin"]);
export const organizationRoleEnum = pgEnum("organization_role", ["owner", "admin", "member", "viewer"]);
export const apiKeyStatusEnum = pgEnum("api_key_status", ["active", "disabled", "revoked"]);
export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", [
  "opening_balance",
  "credit",
  "debit",
  "adjustment",
  "refund",
  "hold",
  "release",
]);
export const usageEventStatusEnum = pgEnum("usage_event_status", [
  "reserved",
  "settlement_pending",
  "settled",
  "reversed",
  "failed",
]);
export const presetScopeEnum = pgEnum("preset_scope", ["personal", "organization"]);
export const paymentProviderStatusEnum = pgEnum("payment_provider_status", ["active", "disabled"]);
export const paymentOrderStatusEnum = pgEnum("payment_order_status", ["pending", "paid", "failed", "refunded", "cancelled"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "cancelled", "expired"]);
export const subscriptionIntervalEnum = pgEnum("subscription_interval", ["month", "year", "one_time"]);
export const pricingCatalogStateEnum = pgEnum("pricing_catalog_state", ["draft", "active", "retired"]);
export const pricingModeEnum = pgEnum("pricing_mode", ["ratio", "fixed", "tiered_expr"]);
export const fundingPreferenceEnum = pgEnum("funding_preference", [
  "subscription_first",
  "wallet_first",
  "subscription_only",
  "wallet_only",
]);
export const subscriptionQuotaLedgerEntryTypeEnum = pgEnum("subscription_quota_ledger_entry_type", [
  "hold",
  "release",
  "debit",
  "refund",
  "reset",
  "adjustment",
]);
export const enterpriseBillingRequestStatusEnum = pgEnum("enterprise_billing_request_status", [
  "pending",
  "approved",
  "rejected",
]);

const createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyNewApiUserId: integer("legacy_new_api_user_id").unique(),
    username: varchar("username", { length: 64 }).notNull(),
    email: varchar("email", { length: 320 }).unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    image: text("image"),
    passwordHash: varchar("password_hash", { length: 255 }),
    status: userStatusEnum("status").default("active").notNull(),
    platformRole: platformRoleEnum("platform_role").default("user").notNull(),
    isServiceAccount: boolean("is_service_account").default(false).notNull(),
    authVersion: integer("auth_version").default(1).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    index("users_status_index").on(table.status),
  ],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    accessTokenCiphertext: text("access_token_ciphertext"),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("auth_identities_provider_account_unique").on(table.provider, table.providerAccountId),
    index("auth_identities_user_index").on(table.userId),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organizations_slug_unique").on(table.slug),
    index("organizations_created_by_user_index").on(table.createdByUserId),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: organizationRoleEnum("role").default("member").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organization_memberships_organization_user_unique").on(table.organizationId, table.userId),
    index("organization_memberships_user_index").on(table.userId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 32 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    status: apiKeyStatusEnum("status").default("active").notNull(),
    scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    allowedModels: text("allowed_models").array().notNull().default(sql`ARRAY[]::text[]`),
    allowedGroups: text("allowed_groups").array().notNull().default(sql`ARRAY[]::text[]`),
    ipAllowlist: text("ip_allowlist").array().notNull().default(sql`ARRAY[]::text[]`),
    quotaLimitMicrocredits: bigint("quota_limit_microcredits", { mode: "bigint" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    index("api_keys_user_index").on(table.userId),
    index("api_keys_organization_index").on(table.organizationId),
    index("api_keys_prefix_index").on(table.keyPrefix),
  ],
);

export const pricingCatalogVersions = pgTable(
  "pricing_catalog_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceKind: varchar("source_kind", { length: 64 }).notNull(),
    sourceInstanceLabel: varchar("source_instance_label", { length: 120 }).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    algorithmVersion: varchar("algorithm_version", { length: 64 }).notNull(),
    quotaPerUnit: numeric("quota_per_unit").notNull(),
    preConsumedTokens: bigint("pre_consumed_tokens", { mode: "bigint" }).notNull(),
    state: pricingCatalogStateEnum("state").default("draft").notNull(),
    sourceSnapshot: jsonb("source_snapshot").$type<Record<string, unknown>>().notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("pricing_catalog_versions_source_hash_unique").on(table.sourceHash),
    uniqueIndex("pricing_catalog_versions_single_active_unique")
      .on(table.state)
      .where(sql`${table.state} = 'active'`),
    check("pricing_catalog_versions_quota_positive", sql`${table.quotaPerUnit} > 0`),
    check("pricing_catalog_versions_preconsume_nonnegative", sql`${table.preConsumedTokens} >= 0`),
  ],
);

export const pricingModelRules = pgTable(
  "pricing_model_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogVersionId: uuid("catalog_version_id")
      .notNull()
      .references(() => pricingCatalogVersions.id, { onDelete: "cascade" }),
    modelKey: varchar("model_key", { length: 255 }).notNull(),
    mode: pricingModeEnum("mode").notNull(),
    modelRatio: numeric("model_ratio"),
    fixedPriceUsd: numeric("fixed_price_usd"),
    completionRatio: numeric("completion_ratio"),
    cacheReadRatio: numeric("cache_read_ratio"),
    cacheWriteRatio: numeric("cache_write_ratio"),
    cacheWriteOneHourRatio: numeric("cache_write_one_hour_ratio"),
    imageRatio: numeric("image_ratio"),
    audioInputRatio: numeric("audio_input_ratio"),
    audioCompletionRatio: numeric("audio_completion_ratio"),
    tieredExpression: text("tiered_expression"),
    tieredExpressionHash: varchar("tiered_expression_hash", { length: 64 }),
    tieredExpressionVersion: varchar("tiered_expression_version", { length: 64 }),
    toolPrices: jsonb("tool_prices").$type<Record<string, string>>().notNull().default({}),
    enabledGroups: text("enabled_groups").array().notNull().default(sql`ARRAY[]::text[]`),
    protocolFamilies: text("protocol_families").array().notNull().default(sql`ARRAY[]::text[]`),
    ruleHash: varchar("rule_hash", { length: 64 }).notNull(),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("pricing_model_rules_catalog_model_unique").on(table.catalogVersionId, table.modelKey),
    index("pricing_model_rules_catalog_index").on(table.catalogVersionId),
    check(
      "pricing_model_rules_mode_value_check",
      sql`(${table.mode} = 'ratio' AND ${table.modelRatio} IS NOT NULL) OR (${table.mode} = 'fixed' AND ${table.fixedPriceUsd} IS NOT NULL) OR (${table.mode} = 'tiered_expr' AND ${table.tieredExpression} IS NOT NULL AND ${table.tieredExpressionHash} IS NOT NULL AND ${table.tieredExpressionVersion} IS NOT NULL)`,
    ),
    check(
      "pricing_model_rules_nonnegative_check",
      sql`COALESCE(${table.modelRatio}, 0) >= 0 AND COALESCE(${table.fixedPriceUsd}, 0) >= 0 AND COALESCE(${table.completionRatio}, 0) >= 0 AND COALESCE(${table.cacheReadRatio}, 0) >= 0 AND COALESCE(${table.cacheWriteRatio}, 0) >= 0 AND COALESCE(${table.cacheWriteOneHourRatio}, 0) >= 0 AND COALESCE(${table.imageRatio}, 0) >= 0 AND COALESCE(${table.audioInputRatio}, 0) >= 0 AND COALESCE(${table.audioCompletionRatio}, 0) >= 0`,
    ),
  ],
);

export const pricingGroupRules = pgTable(
  "pricing_group_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogVersionId: uuid("catalog_version_id")
      .notNull()
      .references(() => pricingCatalogVersions.id, { onDelete: "cascade" }),
    userGroup: varchar("user_group", { length: 120 }).notNull(),
    billingGroup: varchar("billing_group", { length: 120 }).notNull(),
    groupRatio: numeric("group_ratio").notNull(),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("pricing_group_rules_catalog_groups_unique").on(
      table.catalogVersionId,
      table.userGroup,
      table.billingGroup,
    ),
    index("pricing_group_rules_catalog_index").on(table.catalogVersionId),
    check("pricing_group_rules_ratio_nonnegative", sql`${table.groupRatio} >= 0`),
  ],
);

export const modelAvailability = pgTable(
  "model_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogVersionId: uuid("catalog_version_id")
      .notNull()
      .references(() => pricingCatalogVersions.id, { onDelete: "cascade" }),
    model: varchar("model", { length: 255 }).notNull(),
    billingGroup: varchar("billing_group", { length: 120 }).notNull(),
    providerType: integer("provider_type").notNull(),
    protocolFamily: varchar("protocol_family", { length: 64 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    priority: integer("priority").default(0).notNull(),
    weight: integer("weight").default(0).notNull(),
    priorityMetadata: jsonb("priority_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("model_availability_catalog_model_group_provider_unique").on(
      table.catalogVersionId,
      table.model,
      table.billingGroup,
      table.providerType,
    ),
    index("model_availability_catalog_index").on(table.catalogVersionId),
    index("model_availability_enabled_model_group_index").on(table.enabled, table.model, table.billingGroup),
    check(
      "model_availability_selection_nonnegative_check",
      sql`${table.providerType} >= 0 AND ${table.priority} >= 0 AND ${table.weight} >= 0`,
    ),
  ],
);

export const billingProfiles = pgTable(
  "billing_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultGroup: varchar("default_group", { length: 120 }).default("default").notNull(),
    fundingPreference: fundingPreferenceEnum("funding_preference").default("subscription_first").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
);

export const apiKeyBillingPolicies = pgTable(
  "api_key_billing_policies",
  {
    apiKeyId: uuid("api_key_id")
      .primaryKey()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    userGroup: varchar("user_group", { length: 120 }).default("default").notNull(),
    billingGroup: varchar("billing_group", { length: 120 }).default("default").notNull(),
    unlimited: boolean("unlimited").default(false).notNull(),
    quotaLimit: bigint("quota_limit", { mode: "bigint" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "api_key_billing_policies_limit_check",
      sql`(${table.unlimited} = true AND ${table.quotaLimit} IS NULL) OR (${table.unlimited} = false AND ${table.quotaLimit} IS NOT NULL AND ${table.quotaLimit} >= 0)`,
    ),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }).unique(),
    currency: varchar("currency", { length: 16 }).default("credits").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("wallets_user_index").on(table.userId)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    catalogVersionId: uuid("catalog_version_id").references(() => pricingCatalogVersions.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    requestId: varchar("request_id", { length: 255 }),
    provider: varchar("provider", { length: 80 }).notNull(),
    model: varchar("model", { length: 255 }).notNull(),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).default(sql`0`).notNull(),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).default(sql`0`).notNull(),
    totalTokens: bigint("total_tokens", { mode: "bigint" }).default(sql`0`).notNull(),
    costMicrocredits: bigint("cost_microcredits", { mode: "bigint" }).default(sql`0`).notNull(),
    status: usageEventStatusEnum("status").default("reserved").notNull(),
    canonicalUsage: jsonb("canonical_usage").$type<Record<string, unknown>>(),
    usageProvenance: jsonb("usage_provenance").$type<Record<string, unknown>>(),
    completionState: varchar("completion_state", { length: 64 }),
    streamEndReason: varchar("stream_end_reason", { length: 128 }),
    fundingKind: varchar("funding_kind", { length: 32 }),
    fundingReference: varchar("funding_reference", { length: 255 }),
    reservedQuota: bigint("reserved_quota", { mode: "bigint" }).default(sql`0`).notNull(),
    actualQuota: bigint("actual_quota", { mode: "bigint" }),
    settlementAttemptCount: integer("settlement_attempt_count").default(0).notNull(),
    channelCostQuota: bigint("channel_cost_quota", { mode: "bigint" }),
    profitQuota: bigint("profit_quota", { mode: "bigint" }),
    operationId: varchar("operation_id", { length: 255 }),
    completionSnapshotAt: timestamp("completion_snapshot_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("usage_events_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    uniqueIndex("usage_events_operation_id_unique").on(table.operationId),
    index("usage_events_user_occurred_index").on(table.userId, table.occurredAt),
    index("usage_events_organization_index").on(table.organizationId),
    index("usage_events_api_key_index").on(table.apiKeyId),
    index("usage_events_catalog_version_index").on(table.catalogVersionId),
    index("usage_events_pending_recovery_index")
      .on(table.completionSnapshotAt, table.id)
      .where(sql`${table.status} = 'settlement_pending'`),
    index("usage_events_reserved_recovery_index")
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = 'reserved'`),
    check("usage_events_reserved_quota_nonnegative", sql`${table.reservedQuota} >= 0`),
    check(
      "usage_events_actual_quota_nonnegative",
      sql`${table.actualQuota} IS NULL OR ${table.actualQuota} >= 0`,
    ),
    check(
      "usage_events_settlement_attempt_count_nonnegative",
      sql`${table.settlementAttemptCount} >= 0`,
    ),
    check(
      "usage_events_channel_cost_quota_nonnegative",
      sql`${table.channelCostQuota} IS NULL OR ${table.channelCostQuota} >= 0`,
    ),
    check(
      "usage_events_pending_recovery_fields_check",
      sql`${table.status} <> 'settlement_pending' OR (${table.operationId} IS NOT NULL AND ${table.catalogVersionId} IS NOT NULL AND ${table.canonicalUsage} IS NOT NULL AND ${table.usageProvenance} IS NOT NULL AND ${table.completionState} IS NOT NULL AND ${table.fundingKind} IS NOT NULL AND ${table.fundingReference} IS NOT NULL AND ${table.actualQuota} IS NOT NULL AND ${table.completionSnapshotAt} IS NOT NULL)`,
    ),
  ],
);

export const apiKeyQuotaLedgerEntries = pgTable(
  "api_key_quota_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "restrict" }),
    usageEventId: uuid("usage_event_id").references(() => usageEvents.id, { onDelete: "set null" }),
    entryType: ledgerEntryTypeEnum("entry_type").notNull(),
    quotaDelta: bigint("quota_delta", { mode: "bigint" }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    reference: varchar("reference", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("api_key_quota_ledger_entries_key_idempotency_unique").on(table.apiKeyId, table.idempotencyKey),
    index("api_key_quota_ledger_entries_key_created_index").on(table.apiKeyId, table.createdAt),
    index("api_key_quota_ledger_entries_usage_event_index").on(table.usageEventId),
    check("api_key_quota_ledger_entries_nonzero_delta", sql`${table.quotaDelta} <> 0`),
  ],
);

export const billingShadowEvents = pgTable(
  "billing_shadow_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: varchar("request_id", { length: 255 }).notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    usageEventId: uuid("usage_event_id").references(() => usageEvents.id, { onDelete: "set null" }),
    catalogVersionId: uuid("catalog_version_id")
      .notNull()
      .references(() => pricingCatalogVersions.id, { onDelete: "restrict" }),
    model: varchar("model", { length: 255 }).notNull(),
    canonicalUsage: jsonb("canonical_usage").$type<Record<string, unknown>>().notNull(),
    usageProvenance: jsonb("usage_provenance").$type<Record<string, unknown>>().notNull(),
    pricingQuote: jsonb("pricing_quote").$type<Record<string, unknown>>().notNull(),
    calculatedReservationQuota: bigint("calculated_reservation_quota", { mode: "bigint" }).notNull(),
    calculatedActualQuota: bigint("calculated_actual_quota", { mode: "bigint" }),
    referenceQuota: bigint("reference_quota", { mode: "bigint" }),
    quotaDelta: bigint("quota_delta", { mode: "bigint" }),
    outcome: varchar("outcome", { length: 64 }).notNull(),
    mismatchClass: varchar("mismatch_class", { length: 128 }),
    completionState: varchar("completion_state", { length: 64 }),
    sanitizedErrorClass: varchar("sanitized_error_class", { length: 128 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("billing_shadow_events_request_id_index").on(table.requestId),
    index("billing_shadow_events_model_index").on(table.model),
    index("billing_shadow_events_outcome_index").on(table.outcome),
    index("billing_shadow_events_mismatch_class_index").on(table.mismatchClass),
    index("billing_shadow_events_created_id_index").on(table.createdAt, table.id),
    index("billing_shadow_events_user_index").on(table.userId),
    index("billing_shadow_events_organization_index").on(table.organizationId),
    index("billing_shadow_events_api_key_index").on(table.apiKeyId),
    index("billing_shadow_events_usage_event_index").on(table.usageEventId),
    index("billing_shadow_events_catalog_version_index").on(table.catalogVersionId),
    check(
      "billing_shadow_events_reservation_nonnegative",
      sql`${table.calculatedReservationQuota} >= 0`,
    ),
    check(
      "billing_shadow_events_actual_nonnegative",
      sql`${table.calculatedActualQuota} IS NULL OR ${table.calculatedActualQuota} >= 0`,
    ),
    check(
      "billing_shadow_events_reference_nonnegative",
      sql`${table.referenceQuota} IS NULL OR ${table.referenceQuota} >= 0`,
    ),
  ],
);

export const gatewayRelayAttempts = pgTable(
  "gateway_relay_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    usageEventId: uuid("usage_event_id")
      .notNull()
      .references(() => usageEvents.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    channelId: varchar("channel_id", { length: 255 }).notNull(),
    providerType: integer("provider_type").notNull(),
    status: varchar("status", { length: 64 }).notNull(),
    retryReason: varchar("retry_reason", { length: 128 }),
    sanitizedErrorClass: varchar("sanitized_error_class", { length: 128 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("gateway_relay_attempts_usage_attempt_unique").on(table.usageEventId, table.attemptNumber),
    index("gateway_relay_attempts_usage_created_index").on(table.usageEventId, table.createdAt),
    check("gateway_relay_attempts_number_positive", sql`${table.attemptNumber} > 0`),
    check("gateway_relay_attempts_provider_type_nonnegative", sql`${table.providerType} >= 0`),
    check(
      "gateway_relay_attempts_completion_after_start",
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const walletLedgerEntries = pgTable(
  "wallet_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id").notNull().references(() => wallets.id, { onDelete: "restrict" }),
    usageEventId: uuid("usage_event_id").references(() => usageEvents.id, { onDelete: "set null" }),
    entryType: ledgerEntryTypeEnum("entry_type").notNull(),
    amountMicrocredits: bigint("amount_microcredits", { mode: "bigint" }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    reference: varchar("reference", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("wallet_ledger_entries_wallet_idempotency_unique").on(table.walletId, table.idempotencyKey),
    index("wallet_ledger_entries_wallet_created_index").on(table.walletId, table.createdAt),
    index("wallet_ledger_entries_usage_event_index").on(table.usageEventId),
    check("wallet_ledger_entries_nonzero_amount", sql`${table.amountMicrocredits} <> 0`),
  ],
);

export const personalityPresets = pgTable(
  "personality_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    scope: presetScopeEnum("scope").default("personal").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    instructions: text("instructions").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("personality_presets_owner_index").on(table.ownerUserId),
    index("personality_presets_organization_index").on(table.organizationId),
    uniqueIndex("personality_presets_personal_default_unique")
      .on(table.ownerUserId)
      .where(sql`${table.isDefault} = true AND ${table.scope} = 'personal'`),
    uniqueIndex("personality_presets_organization_default_unique")
      .on(table.organizationId)
      .where(sql`${table.isDefault} = true AND ${table.scope} = 'organization'`),
    check(
      "personality_presets_scope_organization_check",
      sql`(${table.scope} = 'personal' AND ${table.organizationId} IS NULL) OR (${table.scope} = 'organization' AND ${table.organizationId} IS NOT NULL)`,
    ),
  ],
);

export const toolPresets = pgTable(
  "tool_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    scope: presetScopeEnum("scope").default("personal").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    toolConfiguration: jsonb("tool_configuration").$type<Record<string, unknown>>().notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("tool_presets_owner_index").on(table.ownerUserId),
    index("tool_presets_organization_index").on(table.organizationId),
    uniqueIndex("tool_presets_personal_default_unique")
      .on(table.ownerUserId)
      .where(sql`${table.isDefault} = true AND ${table.scope} = 'personal'`),
    uniqueIndex("tool_presets_organization_default_unique")
      .on(table.organizationId)
      .where(sql`${table.isDefault} = true AND ${table.scope} = 'organization'`),
    check(
      "tool_presets_scope_organization_check",
      sql`(${table.scope} = 'personal' AND ${table.organizationId} IS NULL) OR (${table.scope} = 'organization' AND ${table.organizationId} IS NOT NULL)`,
    ),
  ],
);

/** Provider metadata is operational configuration; secret fields must be encrypted by the caller. */
export const paymentProviders = pgTable(
  "payment_providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    status: paymentProviderStatusEnum("status").default("active").notNull(),
    configurationCiphertext: text("configuration_ciphertext"),
    webhookSecretCiphertext: text("webhook_secret_ciphertext"),
    supportedCurrencies: text("supported_currencies").array().notNull().default(sql`ARRAY['USD']::text[]`),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("payment_providers_slug_unique").on(table.slug),
    index("payment_providers_status_index").on(table.status),
  ],
);

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    interval: subscriptionIntervalEnum("interval").default("month").notNull(),
    priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 8 }).default("USD").notNull(),
    entitlements: jsonb("entitlements").$type<Record<string, unknown>>().notNull().default({}),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("subscription_plans_code_unique").on(table.code),
    index("subscription_plans_active_index").on(table.active),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    paymentProviderId: uuid("payment_provider_id").references(() => paymentProviders.id, { onDelete: "set null" }),
    externalSubscriptionId: varchar("external_subscription_id", { length: 255 }),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("subscriptions_provider_external_unique").on(table.paymentProviderId, table.externalSubscriptionId),
    index("subscriptions_user_status_index").on(table.userId, table.status),
    index("subscriptions_period_end_index").on(table.currentPeriodEnd),
  ],
);

export const subscriptionQuotaStates = pgTable(
  "subscription_quota_states",
  {
    subscriptionId: uuid("subscription_id")
      .primaryKey()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    resetWindowStartedAt: timestamp("reset_window_started_at", { withTimezone: true }).notNull(),
    resetWindowEndsAt: timestamp("reset_window_ends_at", { withTimezone: true }).notNull(),
    nextResetAt: timestamp("next_reset_at", { withTimezone: true }).notNull(),
    windowQuotaLimit: bigint("window_quota_limit", { mode: "bigint" }),
    windowQuotaConsumed: bigint("window_quota_consumed", { mode: "bigint" }).default(sql`0`).notNull(),
    cumulativeQuotaLimit: bigint("cumulative_quota_limit", { mode: "bigint" }),
    cumulativeQuotaConsumed: bigint("cumulative_quota_consumed", { mode: "bigint" }).default(sql`0`).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "subscription_quota_states_reset_window_order",
      sql`${table.resetWindowEndsAt} > ${table.resetWindowStartedAt} AND ${table.nextResetAt} >= ${table.resetWindowEndsAt}`,
    ),
    check(
      "subscription_quota_states_limits_nonnegative",
      sql`(${table.windowQuotaLimit} IS NULL OR ${table.windowQuotaLimit} >= 0) AND (${table.cumulativeQuotaLimit} IS NULL OR ${table.cumulativeQuotaLimit} >= 0)`,
    ),
    check(
      "subscription_quota_states_consumed_nonnegative",
      sql`${table.windowQuotaConsumed} >= 0 AND ${table.cumulativeQuotaConsumed} >= 0`,
    ),
    check(
      "subscription_quota_states_consumed_within_limits",
      sql`(${table.windowQuotaLimit} IS NULL OR ${table.windowQuotaConsumed} <= ${table.windowQuotaLimit}) AND (${table.cumulativeQuotaLimit} IS NULL OR ${table.cumulativeQuotaConsumed} <= ${table.cumulativeQuotaLimit})`,
    ),
  ],
);

export const subscriptionQuotaLedgerEntries = pgTable(
  "subscription_quota_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    usageEventId: uuid("usage_event_id").references(() => usageEvents.id, { onDelete: "set null" }),
    entryType: subscriptionQuotaLedgerEntryTypeEnum("entry_type").notNull(),
    quotaDelta: bigint("quota_delta", { mode: "bigint" }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    reference: varchar("reference", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("subscription_quota_ledger_entries_subscription_idempotency_unique").on(
      table.subscriptionId,
      table.idempotencyKey,
    ),
    index("subscription_quota_ledger_entries_subscription_created_index").on(table.subscriptionId, table.createdAt),
    index("subscription_quota_ledger_entries_usage_event_index").on(table.usageEventId),
    check("subscription_quota_ledger_entries_nonzero_delta", sql`${table.quotaDelta} <> 0`),
  ],
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    paymentProviderId: uuid("payment_provider_id").notNull().references(() => paymentProviders.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    orderReference: varchar("order_reference", { length: 255 }).notNull(),
    externalReference: varchar("external_reference", { length: 255 }),
    status: paymentOrderStatusEnum("status").default("pending").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 8 }).default("USD").notNull(),
    creditsMicrocredits: bigint("credits_microcredits", { mode: "bigint" }).default(sql`0`).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("payment_orders_order_reference_unique").on(table.orderReference),
    uniqueIndex("payment_orders_provider_external_unique").on(table.paymentProviderId, table.externalReference),
    uniqueIndex("payment_orders_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("payment_orders_user_status_index").on(table.userId, table.status),
  ],
);

/**
 * v1 enterprise billing: a lead-capture form (this table) plus a manual
 * gateway-admin review queue. Deliberately NOT an automated invoicing/net-30
 * billing engine — that is out of scope for this pass. Submitted by an org
 * owner/admin on behalf of their organization; reviewed by a platform admin
 * who approves/rejects off-platform (offline contract, manual onboarding).
 */
export const enterpriseBillingRequests = pgTable(
  "enterprise_billing_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    companyName: varchar("company_name", { length: 200 }).notNull(),
    taxId: varchar("tax_id", { length: 64 }),
    contactName: varchar("contact_name", { length: 120 }).notNull(),
    contactEmail: varchar("contact_email", { length: 320 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 40 }),
    estimatedMonthlySpendCredits: numeric("estimated_monthly_spend_credits"),
    notes: text("notes"),
    status: enterpriseBillingRequestStatusEnum("status").default("pending").notNull(),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewNotes: text("review_notes"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("enterprise_billing_requests_organization_index").on(table.organizationId),
    index("enterprise_billing_requests_status_index").on(table.status),
    index("enterprise_billing_requests_organization_created_index").on(table.organizationId, table.createdAt),
    // Enforces the "one open request per org" product rule at the data layer,
    // in addition to the application-level check in submitEnterpriseBillingRequest.
    uniqueIndex("enterprise_billing_requests_organization_pending_unique")
      .on(table.organizationId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * Upstream relay channel connection config, managed via
 * /gateway-admin/channels. Config management only — services/gateway's
 * relay.StaticSelector does not read this table yet, so it has no effect on
 * live request routing until a separate follow-up wires it in.
 */
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    protocolFamily: varchar("protocol_family", { length: 64 }).notNull(),
    baseUrl: text("base_url").notNull(),
    apiKey: text("api_key").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    priority: integer("priority").default(0).notNull(),
    weight: integer("weight").default(0).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("channels_name_unique").on(table.name)],
);
