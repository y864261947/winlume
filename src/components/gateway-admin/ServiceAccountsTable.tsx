"use client";

import { useCallback, useEffect, useState } from "react";

interface ServiceAccount {
  user_id: string;
  username: string;
  display_name: string;
  user_status: string;
  api_key_id: string;
  key_prefix: string;
  api_key_status: string;
  billing_group: string;
  unlimited: boolean;
  quota_limit: number | null;
  last_used_at: string | null;
  created_at: string;
  total_spent_microcredits: number;
}

export default function ServiceAccountsTable() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gateway-admin/service-accounts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "加载失败");
      setAccounts(body.service_accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateQuota = useCallback(async (account: ServiceAccount) => {
    const raw = window.prompt(`设置 ${account.display_name} 的配额上限（留空 = 无限制）`, account.quota_limit?.toString() ?? "");
    if (raw === null) return;
    const trimmed = raw.trim();
    const unlimited = trimmed === "";
    const quotaLimit = unlimited ? null : Number(trimmed);
    if (!unlimited && (!Number.isFinite(quotaLimit) || quotaLimit! < 0)) {
      window.alert("配额上限必须是非负数字。");
      return;
    }
    const response = await fetch(`/api/gateway-admin/service-accounts/${account.api_key_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billing_group: account.billing_group, unlimited, quota_limit: quotaLimit }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      window.alert(body.error ?? "更新失败");
      return;
    }
    await load();
  }, [load]);

  const revoke = useCallback(async (account: ServiceAccount) => {
    if (!window.confirm(`确定要吊销 ${account.display_name} 的 key 吗？此操作不可撤销。`)) return;
    const response = await fetch(`/api/gateway-admin/service-accounts/${account.api_key_id}/revoke`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      window.alert(body.error ?? "吊销失败");
      return;
    }
    await load();
  }, [load]);

  if (loading) return <p className="text-sm text-ink-600">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (accounts.length === 0) return <p className="text-sm text-ink-600">还没有 service account。用 create-service-account 命令创建一个。</p>;

  return (
    <table className="w-full border border-line text-sm">
      <thead>
        <tr className="border-b border-line bg-canvas text-left text-ink-600">
          <th className="p-3 font-medium">应用</th>
          <th className="p-3 font-medium">Key</th>
          <th className="p-3 font-medium">计费组</th>
          <th className="p-3 font-medium">配额</th>
          <th className="p-3 font-medium">已用</th>
          <th className="p-3 font-medium">状态</th>
          <th className="p-3 font-medium">操作</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={account.api_key_id} className="border-b border-line last:border-b-0">
            <td className="p-3 text-ink-950">{account.display_name}<div className="text-xs text-ink-500">{account.username}</div></td>
            <td className="p-3 font-mono text-xs text-ink-700">{account.key_prefix}…</td>
            <td className="p-3 text-ink-700">{account.billing_group}</td>
            <td className="p-3 text-ink-700">{account.unlimited ? "无限制" : (account.quota_limit ?? 0)}</td>
            <td className="p-3 text-ink-700">{account.total_spent_microcredits}</td>
            <td className="p-3 text-ink-700">{account.api_key_status}</td>
            <td className="p-3">
              <button type="button" onClick={() => void updateQuota(account)} className="mr-3 text-ink-700 underline hover:text-ink-950">改配额</button>
              {account.api_key_status !== "revoked" && (
                <button type="button" onClick={() => void revoke(account)} className="text-red-600 underline hover:text-red-800">吊销</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
