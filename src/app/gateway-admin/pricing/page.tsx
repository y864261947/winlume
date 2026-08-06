import PricingGroupRulesTable from "@/components/gateway-admin/PricingGroupRulesTable";
import PricingModelRulesTable from "@/components/gateway-admin/PricingModelRulesTable";

export default function GatewayAdminPricingPage() {
  return (
    <div className="flex flex-col gap-10">
      <PricingGroupRulesTable />
      <PricingModelRulesTable />
    </div>
  );
}
