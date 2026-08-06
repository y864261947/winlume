import PricingGroupRulesTable from "@/components/gateway-admin/PricingGroupRulesTable";
import PricingModelRulesTable from "@/components/gateway-admin/PricingModelRulesTable";

export default function GatewayAdminPricingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-950">Pricing</h1>
        <p className="mt-1 text-sm text-ink-600">编辑分组倍率与模型定价，保存后立即生效（内部走版本化目录）。</p>
      </div>
      <div className="flex flex-col gap-6">
        <PricingGroupRulesTable />
        <PricingModelRulesTable />
      </div>
    </div>
  );
}
