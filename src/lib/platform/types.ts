export const PLATFORM_ROLES = ["user", "admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const USER_STATUSES = ["active", "suspended", "pending"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ORGANIZATION_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const API_KEY_STATUSES = ["active", "disabled", "revoked"] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export const LEDGER_ENTRY_TYPES = [
  "opening_balance",
  "credit",
  "debit",
  "adjustment",
  "refund",
  "hold",
  "release",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const USAGE_EVENT_STATUSES = ["reserved", "settlement_pending", "settled", "reversed", "failed"] as const;
export type UsageEventStatus = (typeof USAGE_EVENT_STATUSES)[number];

export const CATALOG_STATES = ["draft", "active", "retired"] as const;
export type PricingCatalogState = (typeof CATALOG_STATES)[number];

export const PRICE_MODES = ["ratio", "fixed", "tiered_expr"] as const;
export type PricingMode = (typeof PRICE_MODES)[number];

export const FUNDING_PREFERENCES = [
  "subscription_first",
  "wallet_first",
  "subscription_only",
  "wallet_only",
] as const;
export type FundingPreference = (typeof FUNDING_PREFERENCES)[number];

export const SUBSCRIPTION_QUOTA_LEDGER_ENTRY_TYPES = [
  "hold",
  "release",
  "debit",
  "refund",
  "reset",
  "adjustment",
] as const;
export type SubscriptionQuotaLedgerEntryType = (typeof SUBSCRIPTION_QUOTA_LEDGER_ENTRY_TYPES)[number];

export const PRESET_SCOPES = ["personal", "organization"] as const;
export type PresetScope = (typeof PRESET_SCOPES)[number];

export const PAYMENT_PROVIDER_STATUSES = ["active", "disabled"] as const;
export type PaymentProviderStatus = (typeof PAYMENT_PROVIDER_STATUSES)[number];

export const PAYMENT_ORDER_STATUSES = ["pending", "paid", "failed", "refunded", "cancelled"] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "cancelled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Minimal, intentionally non-authoritative claims placed in the Auth.js JWT. */
export interface PlatformSessionClaims {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  platformRole: PlatformRole;
  status: UserStatus;
  authVersion: number;
  legacyNewApiUserId: number | null;
}

export interface PlatformAuthUser extends PlatformSessionClaims {
  name: string;
}

export interface OrganizationRoleClaim {
  organizationId: string;
  role: OrganizationRole;
}
