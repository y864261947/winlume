import { readFileSync } from "node:fs";
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

const migrationSql = readFileSync(
  new URL("../../../../drizzle/0003_go_gateway_billing.sql", import.meta.url),
  "utf8",
);

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

  it("makes settlement-pending events complete and efficiently recoverable", () => {
    const usageConfig = getTableConfig(usageEvents);
    expect(usageConfig.checks.map((constraint) => constraint.name)).toContain(
      "usage_events_pending_recovery_fields_check",
    );

    const recoveryIndexes = usageConfig.indexes.filter((index) =>
      ["usage_events_pending_recovery_index", "usage_events_reserved_recovery_index"].includes(
        index.config.name ?? "",
      ),
    );
    expect(recoveryIndexes).toHaveLength(2);
    expect(recoveryIndexes.every((index) => index.config.where !== undefined)).toBe(true);

    const pendingConstraint = migrationSql.match(
      /CONSTRAINT "usage_events_pending_recovery_fields_check" CHECK \(([^\n]+)\)/,
    )?.[1];
    expect(pendingConstraint).toContain(`"usage_events"."status" <> 'settlement_pending'`);
    for (const column of [
      "operation_id",
      "catalog_version_id",
      "canonical_usage",
      "usage_provenance",
      "completion_state",
      "funding_kind",
      "funding_reference",
      "actual_quota",
      "completion_snapshot_at",
    ]) {
      expect(pendingConstraint).toContain(`"usage_events"."${column}" IS NOT NULL`);
    }

    expect(migrationSql).toContain(
      'CREATE INDEX "usage_events_pending_recovery_index" ON "usage_events" USING btree ("completion_snapshot_at","id") WHERE "usage_events"."status" = \'settlement_pending\'',
    );
    expect(migrationSql).toContain(
      'CREATE INDEX "usage_events_reserved_recovery_index" ON "usage_events" USING btree ("created_at","id") WHERE "usage_events"."status" = \'reserved\'',
    );
  });

  it("commits the new usage status before PostgreSQL objects reference it", () => {
    const enumAddition =
      'ALTER TYPE "public"."usage_event_status" ADD VALUE IF NOT EXISTS \'settlement_pending\' BEFORE \'settled\';';
    const migrationStatements = migrationSql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    const enumAdditionOffset = migrationSql.indexOf(enumAddition);
    const enumCommitOffset = migrationSql.indexOf("COMMIT;", enumAdditionOffset);
    const enumRestartOffset = migrationSql.indexOf("BEGIN;", enumCommitOffset);
    const firstPendingObjectOffset = migrationSql.indexOf(
      'CREATE INDEX "usage_events_pending_recovery_index"',
    );

    expect(migrationStatements.slice(0, 3)).toEqual([enumAddition, "COMMIT;", "BEGIN;"]);
    expect(enumAdditionOffset).toBeGreaterThanOrEqual(0);
    expect(enumCommitOffset).toBeGreaterThan(enumAdditionOffset);
    expect(enumRestartOffset).toBeGreaterThan(enumCommitOffset);
    expect(firstPendingObjectOffset).toBeGreaterThan(enumRestartOffset);
  });

  it("freezes activated pricing catalogs and their child rules in PostgreSQL", () => {
    const normalizedSql = migrationSql.replace(/\s+/g, " ");

    expect(normalizedSql).toContain(
      'CREATE OR REPLACE FUNCTION "enforce_pricing_catalog_version_lifecycle"() RETURNS trigger',
    );
    expect(normalizedSql).toContain("IF TG_OP = 'INSERT' THEN");
    expect(normalizedSql).toContain("NEW.state <> 'draft'");
    expect(normalizedSql).toContain("IF TG_OP = 'DELETE' THEN");
    expect(normalizedSql).toContain("IF OLD.state <> 'draft' THEN");
    expect(normalizedSql).toContain("OLD.state = 'draft' AND NEW.state IN ('draft', 'active')");
    expect(normalizedSql).toContain("OLD.state = 'active' AND NEW.state IN ('active', 'retired')");
    expect(normalizedSql).toContain("OLD.state = 'retired' AND NEW.state IN ('retired', 'active')");
    expect(normalizedSql).toContain(
      "to_jsonb(NEW) - ARRAY['state', 'activated_at', 'updated_at']",
    );
    expect(normalizedSql).toContain(
      "to_jsonb(OLD) - ARRAY['state', 'activated_at', 'updated_at']",
    );
    expect(normalizedSql).toContain(
      'CREATE TRIGGER "pricing_catalog_versions_lifecycle" BEFORE INSERT OR UPDATE OR DELETE ON "pricing_catalog_versions"',
    );

    expect(normalizedSql).toContain(
      'CREATE OR REPLACE FUNCTION "enforce_pricing_catalog_child_draft_only"() RETURNS trigger',
    );
    expect(normalizedSql).toContain("OLD.catalog_version_id");
    expect(normalizedSql).toContain("NEW.catalog_version_id");
    expect(normalizedSql).toContain("catalog_state IS DISTINCT FROM 'draft'");
    expect(normalizedSql).toContain("IF NOT FOUND THEN RETURN OLD;");
    expect(normalizedSql).toContain('WHERE "id" = OLD.catalog_version_id FOR SHARE;');
    expect(normalizedSql).toContain('WHERE "id" = NEW.catalog_version_id FOR SHARE;');
    for (const table of ["pricing_model_rules", "pricing_group_rules", "model_availability"]) {
      expect(normalizedSql).toContain(
        `BEFORE INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION "enforce_pricing_catalog_child_draft_only"()`,
      );
    }

    expect(normalizedSql).toContain(
      'CREATE OR REPLACE FUNCTION "prevent_gateway_quota_ledger_mutation"() RETURNS trigger',
    );
    expect(normalizedSql).toContain('CREATE TRIGGER "api_key_quota_ledger_entries_immutable"');
    expect(normalizedSql).toContain('CREATE TRIGGER "subscription_quota_ledger_entries_immutable"');
  });
});
