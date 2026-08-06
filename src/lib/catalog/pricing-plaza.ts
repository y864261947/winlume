import { and, asc, eq } from "drizzle-orm";
import { getPlatformDb } from "@/lib/platform/db/client";
import {
  modelAvailability,
  pricingCatalogVersions,
  pricingGroupRules,
  pricingModelRules,
} from "@/lib/platform/db/schema";
import type { PlazaModel } from "@/lib/catalog";
import { inferVendorFromModel, PLAZA_VENDORS } from "@/lib/catalog/vendors";

function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type GroupPick = {
  groupRatio: number;
  billingGroup: string;
  isMinAmongMany: boolean;
};

/**
 * group_ratio lives on billing groups, not on models. For plaza display we
 * resolve each model against its enabled model_availability rows and pick the
 * best (lowest) matching group ratio so list prices reflect real group maps.
 */
function pickGroupForModel(
  modelKey: string,
  groupRatioByBillingGroup: Map<string, number>,
  availabilityByModel: Map<string, string[]>,
): GroupPick {
  const groups = availabilityByModel.get(modelKey) ?? [];
  const matched: Array<{ billingGroup: string; groupRatio: number }> = [];
  for (const billingGroup of groups) {
    const ratio = groupRatioByBillingGroup.get(billingGroup);
    if (ratio !== undefined && ratio > 0) {
      matched.push({ billingGroup, groupRatio: ratio });
    }
  }
  if (matched.length === 0) {
    return { groupRatio: 1, billingGroup: "default", isMinAmongMany: false };
  }
  matched.sort((a, b) => a.groupRatio - b.groupRatio || a.billingGroup.localeCompare(b.billingGroup));
  const best = matched[0]!;
  return {
    groupRatio: best.groupRatio,
    billingGroup: best.billingGroup,
    isMinAmongMany: matched.length > 1,
  };
}

/**
 * Build plaza rows from the active pricing catalog in Postgres.
 * Returns null when the platform DB is unavailable or no catalog is active,
 * so the API route can fall back to gateway /v1/models.
 */
export async function loadPlazaFromPricingCatalog(): Promise<{
  models: PlazaModel[];
  vendors: Array<{ id: number; name: string; key: string; logo: string }>;
} | null> {
  const db = getPlatformDb();
  if (!db) return null;

  const [active] = await db
    .select({
      id: pricingCatalogVersions.id,
      quotaPerUnit: pricingCatalogVersions.quotaPerUnit,
    })
    .from(pricingCatalogVersions)
    .where(eq(pricingCatalogVersions.state, "active"))
    .limit(1);

  if (!active) return null;

  const quotaPerUnit = toNumber(active.quotaPerUnit, 500_000);

  const [rules, groupRows, availabilityRows] = await Promise.all([
    db
      .select({
        modelKey: pricingModelRules.modelKey,
        mode: pricingModelRules.mode,
        modelRatio: pricingModelRules.modelRatio,
        fixedPriceUsd: pricingModelRules.fixedPriceUsd,
        completionRatio: pricingModelRules.completionRatio,
        enabledGroups: pricingModelRules.enabledGroups,
        protocolFamilies: pricingModelRules.protocolFamilies,
      })
      .from(pricingModelRules)
      .where(eq(pricingModelRules.catalogVersionId, active.id))
      .orderBy(asc(pricingModelRules.modelKey)),
    db
      .select({
        userGroup: pricingGroupRules.userGroup,
        billingGroup: pricingGroupRules.billingGroup,
        groupRatio: pricingGroupRules.groupRatio,
      })
      .from(pricingGroupRules)
      .where(eq(pricingGroupRules.catalogVersionId, active.id)),
    db
      .select({
        model: modelAvailability.model,
        billingGroup: modelAvailability.billingGroup,
      })
      .from(modelAvailability)
      .where(
        and(eq(modelAvailability.catalogVersionId, active.id), eq(modelAvailability.enabled, true)),
      ),
  ]);

  // Ordinary group rules use empty user_group; special user overrides win when present.
  // For plaza list prices we only need ordinary billing_group → ratio.
  const groupRatioByBillingGroup = new Map<string, number>();
  for (const row of groupRows) {
    const ratio = toNumber(row.groupRatio, NaN);
    if (!(ratio > 0)) continue;
    const isSpecial = row.userGroup.trim() !== "";
    if (isSpecial) continue;
    // First write wins; all ordinary rules should be unique per billing_group.
    if (!groupRatioByBillingGroup.has(row.billingGroup)) {
      groupRatioByBillingGroup.set(row.billingGroup, ratio);
    }
  }

  const availabilityByModel = new Map<string, string[]>();
  for (const row of availabilityRows) {
    const list = availabilityByModel.get(row.model) ?? [];
    if (!list.includes(row.billingGroup)) list.push(row.billingGroup);
    availabilityByModel.set(row.model, list);
  }

  const models: PlazaModel[] = rules.map((rule) => {
    const vendor = inferVendorFromModel(rule.modelKey);
    const isFixed = rule.mode === "fixed";
    const endpoints =
      rule.protocolFamilies.length > 0
        ? rule.protocolFamilies
        : vendor.key === "anthropic"
          ? ["claude", "openai"]
          : ["openai"];
    const group = pickGroupForModel(rule.modelKey, groupRatioByBillingGroup, availabilityByModel);

    return {
      model_name: rule.modelKey,
      vendor_id: vendor.id,
      vendor_key: vendor.key,
      vendor_name: vendor.name,
      vendor_logo: vendor.logo,
      quota_type: isFixed ? 1 : 0,
      model_price: isFixed ? toNumber(rule.fixedPriceUsd, 0) : 0,
      model_ratio: isFixed ? 0 : toNumber(rule.modelRatio, 1),
      completion_ratio: toNumber(rule.completionRatio, 1),
      enable_groups: rule.enabledGroups ?? [],
      supported_endpoint_types: endpoints,
      pricing_mode: rule.mode,
      quota_per_unit: quotaPerUnit,
      group_ratio: group.groupRatio,
      billing_group: group.billingGroup,
      group_ratio_is_min: group.isMinAmongMany,
    };
  });

  return {
    models,
    vendors: PLAZA_VENDORS.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      key: vendor.key,
      logo: vendor.logo,
    })),
  };
}

// re-export for callers that want the full vendor theme registry
export { PLAZA_VENDORS };
