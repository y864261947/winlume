import ChannelsTable from "@/components/gateway-admin/ChannelsTable";

export default function GatewayAdminChannelsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-950">Channels</h1>
        <p className="mt-1 text-sm text-ink-600">
          管理上游渠道的连接配置（地址、密钥、优先级/权重）。此页面目前只管理配置数据，尚未接入实际请求路由。
        </p>
      </div>
      <ChannelsTable />
    </div>
  );
}
