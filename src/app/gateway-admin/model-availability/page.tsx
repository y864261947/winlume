import ModelAvailabilityTable from "@/components/gateway-admin/ModelAvailabilityTable";

export default function GatewayAdminModelAvailabilityPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-950">Model Availability</h1>
        <p className="mt-1 text-sm text-ink-600">
          管理当前生效定价目录下各模型 · 计费分组 · 上游的可用性、优先级与权重。
        </p>
      </div>
      <ModelAvailabilityTable />
    </div>
  );
}
