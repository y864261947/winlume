"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { getConsoleOverview, getConsoleUsageByKey, listConsoleKeys } from "@/lib/console/client";
import type { ConsoleOrganization, ConsoleOverview, ConsoleUsageByKey } from "@/lib/console/types";

function number(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export default function AccountUsageContent() {
  const [overview, setOverview] = useState<ConsoleOverview | null>(null);
  const [organizations, setOrganizations] = useState<ConsoleOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [byKey, setByKey] = useState<ConsoleUsageByKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [byKeyError, setByKeyError] = useState<string | null>(null);

  // The day-by-date overview endpoint (/api/console/overview) isn't
  // organization-aware — it always scopes to the caller's own usage — so
  // reloading it on workspace switch re-fetches the same personal totals.
  // We still re-run it alongside the by-key fetch below to keep both panels
  // refreshing together, in case the endpoint gains org support later.
  const loadOverview = useCallback(async () => {
    setError(null);
    try {
      // listConsoleKeys already resolves the caller's workspace list, so we
      // piggyback on it here instead of standing up a dedicated
      // organizations endpoint just for this switcher.
      const [overviewResult, keysResult] = await Promise.all([
        getConsoleOverview(),
        listConsoleKeys(),
      ]);
      setOverview(overviewResult);
      setOrganizations(keysResult.organizations);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法加载用量。");
    }
  }, []);

  const loadByKey = useCallback(async (targetOrganizationId: string | null) => {
    setByKeyError(null);
    try {
      const result = await getConsoleUsageByKey(targetOrganizationId);
      setByKey(result.items);
    } catch (reason) {
      setByKeyError(reason instanceof Error ? reason.message : "无法加载按 Key 拆分的用量。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview();
      void loadByKey(organizationId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [organizationId, loadOverview, loadByKey]);

  function selectWorkspace(nextOrganizationId: string | null) {
    setOrganizationId(nextOrganizationId);
  }

  return (
    <ConsolePage title="用量" description="查看已结算请求的额度消耗和请求量。流式请求在结束后计入统计。">
      {organizations.length > 0 ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-ink-600">
          <span>工作区</span>
          <select
            aria-label="选择工作区"
            value={organizationId ?? ""}
            onChange={(event) => selectWorkspace(event.target.value || null)}
            className="border border-line bg-canvas px-2 py-1.5 text-sm text-ink-700 outline-none focus:border-ink-500"
          >
            <option value="">个人</option>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </div>
      ) : null}
      {!overview && !error ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" /> 正在加载用量…</div> : null}
      {error ? <ConsoleEmptyState title="用量暂不可用" description={error} /> : null}
      {overview ? <>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">已结算额度</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{number(overview.wallet.usedCredits)}</p></div>
          <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">近 14 天请求</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{number(overview.usage.reduce((total, point) => total + point.requests, 0))}</p></div>
          <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">平均每请求</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{number(overview.usage.reduce((total, point) => total + point.requests, 0) ? overview.usage.reduce((total, point) => total + point.credits, 0) / overview.usage.reduce((total, point) => total + point.requests, 0) : 0)}</p></div>
        </div>
        {overview.usage.some((point) => point.requests > 0) ? <div className="mt-7 overflow-x-auto border border-line bg-surface"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-line bg-canvas text-xs text-ink-500"><tr><th className="px-4 py-3">日期</th><th className="px-4 py-3">请求数</th><th className="px-4 py-3">已结算额度</th></tr></thead><tbody className="divide-y divide-line">{overview.usage.map((point) => <tr key={point.date}><td className="px-4 py-3 text-ink-800">{point.date}</td><td className="px-4 py-3 font-mono text-ink-700">{number(point.requests)}</td><td className="px-4 py-3 font-mono text-ink-700">{number(point.credits)}</td></tr>)}</tbody></table></div> : <div className="mt-7"><ConsoleEmptyState title="暂无已结算请求" description="API 请求完成后会在这里按天汇总。" /></div>}

        <h2 className="mt-9 text-sm font-medium text-ink-800">按 Key 拆分</h2>
        {byKeyError ? <p role="alert" className="mt-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{byKeyError}</p> : null}
        {!byKeyError && byKey.length > 0 ? (
          <div className="mt-3 overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs text-ink-500">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  {organizationId ? <th className="px-4 py-3">所有者</th> : null}
                  <th className="px-4 py-3">请求数</th>
                  <th className="px-4 py-3">已结算额度</th>
                  <th className="px-4 py-3">预留额度</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byKey.map((item) => (
                  <tr key={item.apiKeyId}>
                    <td className="px-4 py-3 text-ink-800">
                      <span className="font-medium text-ink-950">{item.keyName}</span>
                      <span className="ml-2 font-mono text-xs text-ink-500">{item.keyPrefix}...</span>
                    </td>
                    {organizationId ? <td className="px-4 py-3 text-xs text-ink-500">{item.ownerName ?? "--"}</td> : null}
                    <td className="px-4 py-3 font-mono text-ink-700">{number(item.requests)}</td>
                    <td className="px-4 py-3 font-mono text-ink-700">{number(item.settledCredits)}</td>
                    <td className="px-4 py-3 font-mono text-ink-700">{number(item.reservedCredits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !byKeyError ? (
          <div className="mt-3"><ConsoleEmptyState title="暂无按 Key 的用量" description="该工作区下的 Key 还没有产生已结算或预留的请求。" /></div>
        ) : null}
      </> : null}
    </ConsolePage>
  );
}
