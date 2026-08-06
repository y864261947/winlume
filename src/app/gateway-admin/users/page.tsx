import UsersTable from "@/components/gateway-admin/UsersTable";

export default function GatewayAdminUsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-950">Users</h1>
        <p className="mt-1 text-sm text-ink-600">平台用户管理：搜索、封禁 / 恢复、调整管理员权限。</p>
      </div>
      <UsersTable />
    </div>
  );
}
