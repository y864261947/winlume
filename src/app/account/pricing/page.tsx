import { eq } from "drizzle-orm";
import AccountPricingContent, {
  type AccountPricingModelRow,
} from "@/components/account/AccountPricingContent";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  apiKeyBillingPolicies,
  apiKeys,
  getPlatformDb,
  pricingCatalogVersions,
  pricingGroupRules,
  pricingModelRules,
} from "@/lib/platform";

const DEFAULT_GROUP = "default";

export default async function AccountPricingPage() {
  const userId = await getCurrentUserId();
  const db = getPlatformDb();

  if (!userId) {
    return <AccountPricingContent status="unauthenticated" />;
  }
  if (!db) {
    return <AccountPricingContent status="unconfigured" />;
  }

  const [catalog] = await db
    .select()
    .from(pricingCatalogVersions)
    .where(eq(pricingCatalogVersions.state, "active"))
    .limit(1);

  if (!catalog) {
    return <AccountPricingContent status="no_active_catalog" />;
  }

  // WinLume does not yet model a canonical per-user billing_group: the
  // gateway's api_key_billing_policies table keys billing_group per API
  // key, not per user. We resolve it by looking at the policies attached
  // to the caller's own keys; if they don't agree on a single group (or
  // the caller has no keyed policy yet) we fall back to the catalog's
  // "default" group rather than guessing a join that doesn't exist.
  const keyPolicies = await db
    .select({
      billingGroup: apiKeyBillingPolicies.billingGroup,
      userGroup: apiKeyBillingPolicies.userGroup,
    })
    .from(apiKeyBillingPolicies)
    .innerJoin(apiKeys, eq(apiKeys.id, apiKeyBillingPolicies.apiKeyId))
    .where(eq(apiKeys.userId, userId));

  const distinctBillingGroups = new Set(keyPolicies.map((policy) => policy.billingGroup));
  const distinctUserGroups = new Set(keyPolicies.map((policy) => policy.userGroup));
  const resolvedFromKeys = keyPolicies.length > 0 && distinctBillingGroups.size === 1;

  const billingGroup = resolvedFromKeys ? keyPolicies[0].billingGroup : DEFAULT_GROUP;
  const userGroup = resolvedFromKeys && distinctUserGroups.size === 1 ? keyPolicies[0].userGroup : DEFAULT_GROUP;

  const [groupRules, modelRules] = await Promise.all([
    db.select().from(pricingGroupRules).where(eq(pricingGroupRules.catalogVersionId, catalog.id)),
    db.select().from(pricingModelRules).where(eq(pricingModelRules.catalogVersionId, catalog.id)),
  ]);

  // Mirrors services/gateway/internal/pricing/catalog.go#resolveGroupRatio:
  // an exact user_group+billing_group override wins, then the generic
  // billing_group rule (empty user_group), else the ratio defaults to 1.
  const groupRatio =
    groupRules.find(
      (rule) => rule.userGroup !== "" && rule.userGroup === userGroup && rule.billingGroup === billingGroup,
    )?.groupRatio ??
    groupRules.find((rule) => rule.userGroup === "" && rule.billingGroup === billingGroup)?.groupRatio ??
    "1";

  const models: AccountPricingModelRow[] = modelRules
    .filter((rule) => rule.enabledGroups.length === 0 || rule.enabledGroups.includes(billingGroup))
    .sort((left, right) => left.modelKey.localeCompare(right.modelKey))
    .map((rule) => ({
      modelKey: rule.modelKey,
      mode: rule.mode,
      modelRatio: rule.modelRatio,
      fixedPriceUsd: rule.fixedPriceUsd,
      completionRatio: rule.completionRatio,
      cacheReadRatio: rule.cacheReadRatio,
      cacheWriteRatio: rule.cacheWriteRatio,
      cacheWriteOneHourRatio: rule.cacheWriteOneHourRatio,
      imageRatio: rule.imageRatio,
      audioInputRatio: rule.audioInputRatio,
      audioCompletionRatio: rule.audioCompletionRatio,
    }));

  return (
    <AccountPricingContent
      status="ready"
      billingGroup={billingGroup}
      userGroup={userGroup}
      billingGroupSource={resolvedFromKeys ? "api_key" : "default"}
      catalog={{
        algorithmVersion: catalog.algorithmVersion,
        activatedAt: catalog.activatedAt ? catalog.activatedAt.toISOString() : null,
        quotaPerUnit: catalog.quotaPerUnit,
      }}
      groupRatio={groupRatio}
      models={models}
    />
  );
}
