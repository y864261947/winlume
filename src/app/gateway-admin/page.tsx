import ServiceAccountsTable from "@/components/gateway-admin/ServiceAccountsTable";

export default function GatewayAdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-950">Service Accounts</h1>
        <p className="mt-1 text-sm text-ink-600">管理内部应用的 service-account key。</p>
      </div>
      <ServiceAccountsTable />
    </div>
  );
}
