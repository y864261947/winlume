import UsageLogsTable from "@/components/gateway-admin/UsageLogsTable";

export default function GatewayAdminLogsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-950">Usage Logs</h1>
        <p className="mt-1 text-sm text-ink-600">全平台用量日志，按时间、状态、模型、用户筛选。</p>
      </div>
      <UsageLogsTable />
    </div>
  );
}
