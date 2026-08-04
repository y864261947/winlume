import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  apiKeyBillingPolicies,
  apiKeyQuotaLedgerEntries,
  billingProfiles,
  billingShadowEvents,
  gatewayRelayAttempts,
  modelAvailability,
  pricingCatalogVersions,
  pricingGroupRules,
  pricingModelRules,
  subscriptionQuotaLedgerEntries,
  subscriptionQuotaStates,
  usageEvents,
} from "./schema";
import {
  CATALOG_STATES,
  FUNDING_PREFERENCES,
  PRICE_MODES,
  SUBSCRIPTION_QUOTA_LEDGER_ENTRY_TYPES,
  USAGE_EVENT_STATUSES,
} from "../types";

describe("Go Gateway billing schema", () => {
  it("exports the locked enum values", () => {
    expect(CATALOG_STATES).toEqual(["draft", "active", "retired"]);
    expect(PRICE_MODES).toEqual(["ratio", "fixed", "tiered_expr"]);
    expect(FUNDING_PREFERENCES).toEqual([
      "subscription_first",
      "wallet_first",
      "subscription_only",
      "wallet_only",
    ]);
    expect(SUBSCRIPTION_QUOTA_LEDGER_ENTRY_TYPES).toEqual([
      "hold",
      "release",
      "debit",
      "refund",
      "reset",
      "adjustment",
    ]);
    expect(USAGE_EVENT_STATUSES).toEqual([
      "reserved",
      "settlement_pending",
      "settled",
      "reversed",
      "failed",
    ]);
  });

  it("exports all versioned pricing and billing tables", () => {
    expect(getTableName(pricingCatalogVersions)).toBe("pricing_catalog_versions");
    expect(getTableName(pricingModelRules)).toBe("pricing_model_rules");
    expect(getTableName(pricingGroupRules)).toBe("pricing_group_rules");
    expect(getTableName(modelAvailability)).toBe("model_availability");
    expect(getTableName(billingProfiles)).toBe("billing_profiles");
    expect(getTableName(apiKeyBillingPolicies)).toBe("api_key_billing_policies");
    expect(getTableName(apiKeyQuotaLedgerEntries)).toBe("api_key_quota_ledger_entries");
    expect(getTableName(subscriptionQuotaStates)).toBe("subscription_quota_states");
    expect(getTableName(subscriptionQuotaLedgerEntries)).toBe("subscription_quota_ledger_entries");
    expect(getTableName(billingShadowEvents)).toBe("billing_shadow_events");
    expect(getTableName(gatewayRelayAttempts)).toBe("gateway_relay_attempts");
  });

  it("keeps pricing snapshots sanitized and exposes required rule fields", () => {
    expect(pricingCatalogVersions).toHaveProperty("sourceHash");
    expect(pricingCatalogVersions).toHaveProperty("quotaPerUnit");
    expect(pricingCatalogVersions).toHaveProperty("preConsumedTokens");
    expect(pricingCatalogVersions).toHaveProperty("sourceSnapshot");

    expect(pricingModelRules).toHaveProperty("modelRatio");
    expect(pricingModelRules).toHaveProperty("fixedPriceUsd");
    expect(pricingModelRules).toHaveProperty("completionRatio");
    expect(pricingModelRules).toHaveProperty("cacheReadRatio");
    expect(pricingModelRules).toHaveProperty("cacheWriteRatio");
    expect(pricingModelRules).toHaveProperty("cacheWriteOneHourRatio");
    expect(pricingModelRules).toHaveProperty("imageRatio");
    expect(pricingModelRules).toHaveProperty("audioInputRatio");
    expect(pricingModelRules).toHaveProperty("audioCompletionRatio");
    expect(pricingModelRules).toHaveProperty("tieredExpression");
    expect(pricingModelRules).toHaveProperty("toolPrices");
    expect(pricingModelRules).toHaveProperty("protocolFamilies");

    const availabilityColumns = Object.keys(modelAvailability);
    expect(availabilityColumns).not.toContain("authorization");
    expect(availabilityColumns).not.toContain("credential");
    expect(availabilityColumns).not.toContain("baseUrl");
    expect(availabilityColumns).not.toContain("headerOverrides");
  });

  it("keeps version selection and quota ledgers durable", () => {
    const catalogIndexes = getTableConfig(pricingCatalogVersions).indexes;
    expect(
      catalogIndexes.some(
        (index) =>
          index.config.name === "pricing_catalog_versions_single_active_unique" &&
          index.config.unique &&
          index.config.where !== undefined,
      ),
    ).toBe(true);

    for (const ledger of [apiKeyQuotaLedgerEntries, subscriptionQuotaLedgerEntries]) {
      expect(ledger).toHaveProperty("quotaDelta");
      expect(ledger).toHaveProperty("idempotencyKey");
      expect(ledger).not.toHaveProperty("updatedAt");
    }

    for (const column of [
      "resetWindowStartedAt",
      "resetWindowEndsAt",
      "nextResetAt",
      "windowQuotaLimit",
      "windowQuotaConsumed",
      "cumulativeQuotaLimit",
      "cumulativeQuotaConsumed",
    ]) {
      expect(subscriptionQuotaStates).toHaveProperty(column);
    }
  });

  it("indexes shadow reconciliation dimensions and relay attempts", () => {
    const shadowIndexNames = getTableConfig(billingShadowEvents).indexes.map((index) => index.config.name);
    expect(shadowIndexNames).toEqual(
      expect.arrayContaining([
        "billing_shadow_events_request_id_index",
        "billing_shadow_events_model_index",
        "billing_shadow_events_outcome_index",
        "billing_shadow_events_mismatch_class_index",
        "billing_shadow_events_created_id_index",
      ]),
    );

    const relayIndexes = getTableConfig(gatewayRelayAttempts).indexes;
    expect(
      relayIndexes.some(
        (index) =>
          index.config.name === "gateway_relay_attempts_usage_attempt_unique" && index.config.unique,
      ),
    ).toBe(true);
  });

  it("extends usage events for durable settlement and recovery", () => {
    for (const column of [
      "catalogVersionId",
      "canonicalUsage",
      "usageProvenance",
      "completionState",
      "streamEndReason",
      "fundingKind",
      "fundingReference",
      "reservedQuota",
      "actualQuota",
      "settlementAttemptCount",
      "channelCostQuota",
      "profitQuota",
      "operationId",
      "completionSnapshotAt",
    ]) {
      expect(usageEvents).toHaveProperty(column);
    }
  });
});
