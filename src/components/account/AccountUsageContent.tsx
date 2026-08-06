"use client";

import { Activity, Gauge, LoaderCircle, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          <StatTile label="已结算额度" value={number(overview.wallet.usedCredits)} icon={ReceiptText} />
          <StatTile
            label="近 14 天请求"
            value={number(overview.usage.reduce((total, point) => total + point.requests, 0))}
            icon={Activity}
            tone="primary"
          />
          <StatTile
            label="平均每请求"
            value={number(overview.usage.reduce((total, point) => total + point.requests, 0) ? overview.usage.reduce((total, point) => total + point.credits, 0) / overview.usage.reduce((total, point) => total + point.requests, 0) : 0)}
            icon={Gauge}
          />
        </div>
        <Card className="mt-7">
          <CardHeader>
            <CardTitle>按日用量</CardTitle>
            <CardDescription>已结算请求按天汇总，流式请求在结束后计入。</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.usage.some((point) => point.requests > 0) ? (
              <Table className="min-w-[520px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>请求数</TableHead>
                    <TableHead>已结算额度</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.usage.map((point) => (
                    <TableRow key={point.date}>
                      <TableCell className="text-ink-800">{point.date}</TableCell>
                      <TableCell className="font-mono text-ink-700">{number(point.requests)}</TableCell>
                      <TableCell className="font-mono text-ink-700">{number(point.credits)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <ConsoleEmptyState title="暂无已结算请求" description="API 请求完成后会在这里按天汇总。" />
            )}
          </CardContent>
        </Card>

        <Card className="mt-7">
          <CardHeader>
            <CardTitle>按 Key 拆分</CardTitle>
          </CardHeader>
          <CardContent>
            {byKeyError ? (
              <p role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{byKeyError}</p>
            ) : byKey.length > 0 ? (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    {organizationId ? <TableHead>所有者</TableHead> : null}
                    <TableHead>请求数</TableHead>
                    <TableHead>已结算额度</TableHead>
                    <TableHead>预留额度</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byKey.map((item) => (
                    <TableRow key={item.apiKeyId}>
                      <TableCell className="text-ink-800">
                        <span className="font-medium text-ink-950">{item.keyName}</span>
                        <span className="ml-2 font-mono text-xs text-ink-500">{item.keyPrefix}...</span>
                      </TableCell>
                      {organizationId ? <TableCell className="text-xs text-ink-500">{item.ownerName ?? "--"}</TableCell> : null}
                      <TableCell className="font-mono text-ink-700">{number(item.requests)}</TableCell>
                      <TableCell className="font-mono text-ink-700">{number(item.settledCredits)}</TableCell>
                      <TableCell className="font-mono text-ink-700">{number(item.reservedCredits)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <ConsoleEmptyState title="暂无按 Key 的用量" description="该工作区下的 Key 还没有产生已结算或预留的请求。" />
            )}
          </CardContent>
        </Card>
      </> : null}
    </ConsolePage>
  );
}
