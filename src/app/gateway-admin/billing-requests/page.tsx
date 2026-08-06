import EnterpriseBillingRequestsTable from "@/components/gateway-admin/EnterpriseBillingRequestsTable";

export default function GatewayAdminBillingRequestsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-950">Billing Requests</h1>
        <p className="mt-1 text-sm text-ink-600">
          对公结算申请：人工审核企业客户提交的结算信息，通过/驳回后走线下签约与对接（v1 不支持自动开票）。
        </p>
      </div>
      <EnterpriseBillingRequestsTable />
    </div>
  );
}
