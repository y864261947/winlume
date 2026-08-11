import AccountPricingContent from "@/components/account/AccountPricingContent";
import { getCurrentUserId } from "@/lib/auth/session";
import { getPlatformDb } from "@/lib/platform";

/**
 * Account pricing formerly read the gateway pricing catalog tables.
 * Those tables were dropped with the billing-engine cutover; pricing now
 * lives on new-api. Surface a stable empty state until a new-api-backed
 * account pricing view is built.
 */
export default async function AccountPricingPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return <AccountPricingContent status="unauthenticated" />;
  }
  if (!getPlatformDb()) {
    return <AccountPricingContent status="unconfigured" />;
  }
  return <AccountPricingContent status="no_active_catalog" />;
}
