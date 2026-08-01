import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
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
export const usageEventStatusEnum = pgEnum("usage_event_status", ["reserved", "settled", "reversed", "failed"]);
export const presetScopeEnum = pgEnum("preset_scope", ["personal", "organization"]);
export const paymentProviderStatusEnum = pgEnum("payment_provider_status", ["active", "disabled"]);
export const paymentOrderStatusEnum = pgEnum("payment_order_status", ["pending", "paid", "failed", "refunded", "cancelled"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "cancelled", "expired"]);
export const subscriptionIntervalEnum = pgEnum("subscription_interval", ["month", "year", "one_time"]);

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
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    requestId: varchar("request_id", { length: 255 }),
    provider: varchar("provider", { length: 80 }).notNull(),
    model: varchar("model", { length: 255 }).notNull(),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).default(sql`0`).notNull(),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).default(sql`0`).notNull(),
    totalTokens: bigint("total_tokens", { mode: "bigint" }).default(sql`0`).notNull(),
    costMicrocredits: bigint("cost_microcredits", { mode: "bigint" }).default(sql`0`).notNull(),
    status: usageEventStatusEnum("status").default("reserved").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("usage_events_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("usage_events_user_occurred_index").on(table.userId, table.occurredAt),
    index("usage_events_api_key_index").on(table.apiKeyId),
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
