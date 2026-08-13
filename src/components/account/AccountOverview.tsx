"use client";

import { Activity, Gauge, KeyRound, ReceiptText, UsersRound, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { StatTile } from "@/components/ui/stat-tile";
import { DEFAULT_QUOTA_PER_UNIT } from "@/lib/catalog/plaza-display";
import { getConsoleOverview, getConsoleUsage, getConsoleUsageCharts } from "@/lib/console/client";
import type { ConsoleOverview, ConsoleUsageCharts, ConsoleUsageModelSlice, ConsoleUsagePoint } from "@/lib/console/types";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

function number(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function percent(value: number) {
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value)}%`;
}

function summarizeModels(models: ConsoleUsageModelSlice[]): ConsoleUsageModelSlice[] {
  const ranked = [...models].sort((left, right) => right.credits - left.credits || right.requests - left.requests);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  if (rest.length === 0) return top;
  return [
    ...top,
    {
      model: "其他",
      credits: rest.reduce((total, item) => total + item.credits, 0),
      requests: rest.reduce((total, item) => total + item.requests, 0),
    },
  ];
}

function TrendSparkline({ points }: { points: ConsoleUsagePoint[] }) {
  const width = 640;
  const height = 148;
  const pad = { top: 10, right: 8, bottom: 22, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxCredits = Math.max(...points.map((point) => point.credits), 0);
  const scaleY = maxCredits > 0 ? maxCredits : 1;
  const last = Math.max(points.length - 1, 1);
  const x = (index: number) => pad.left + (index / last) * innerW;
  const y = (value: number) => pad.top + innerH - (value / scaleY) * innerH;
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.credits).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近 14 天额度消耗趋势" className="h-36 w-full">
      <path d={area} className="fill-primary-500/10" />
      <path d={line} className="stroke-primary-500" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        index % labelEvery === 0 || index === points.length - 1 ? (
          <text key={point.date} x={x(index)} y={height - 4} textAnchor="middle" className="fill-ink-400 text-[10px]">
            {point.date.slice(5)}
          </text>
        ) : null
      ))}
    </svg>
  );
}

export default function AccountOverview() {
  const [overview, setOverview] = useState<ConsoleOverview | null>(null);
  const [charts, setCharts] = useState<ConsoleUsageCharts | null>(null);
  const [usedCredits, setUsedCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatsError(null);
    try {
      const overviewResult = await getConsoleOverview();
      setOverview(overviewResult);
      const organizationId = overviewResult.activeOrganization?.id ?? null;
      if (!organizationId) {
        setCharts(null);
        setUsedCredits(overviewResult.wallet.usedCredits);
        return;
      }

      const [usageResult, chartsResult] = await Promise.allSettled([
        getConsoleUsage(organizationId),
        getConsoleUsageCharts(organizationId),
      ]);

      if (usageResult.status === "fulfilled") {
        setUsedCredits(usageResult.value.usedQuota / DEFAULT_QUOTA_PER_UNIT);
      } else {
        setUsedCredits(overviewResult.wallet.usedCredits);
      }
      if (chartsResult.status === "fulfilled") {
        setCharts(chartsResult.value);
      } else {
        setCharts(null);
      }
      if (usageResult.status === "rejected" || chartsResult.status === "rejected") {
        const first = [usageResult, chartsResult].find((result) => result.status === "rejected");
        setStatsError(first && first.status === "rejected"
          ? (first.reason instanceof Error ? first.reason.message : "近期汇总暂不可用。")
          : "近期汇总暂不可用。");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "账户信息暂不可用。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const windowRequests = charts?.daily.reduce((total, point) => total + point.requests, 0) ?? 0;
  const windowCredits = charts?.daily.reduce((total, point) => total + point.credits, 0) ?? 0;
  const hasTrend = Boolean(charts?.daily.some((point) => point.credits > 0 || point.requests > 0));
  const modelMix = useMemo(() => summarizeModels(charts?.byModel ?? []), [charts]);
  const mixTotal = modelMix.reduce((total, item) => total + item.credits, 0);
  const leadModel = modelMix[0] ?? null;

  return (
    <ConsolePage
      title="概览"
      description="当前工作区的账户状态汇总，不重复密钥、日志和成员明细。"
    >
      {error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !overview ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> 正在加载概览…
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <StatTile
              label="账户余额"
              value={overview ? number(overview.wallet.availableCredits) : "--"}
              hint={overview?.wallet.currency ?? "CNY"}
              icon={WalletCards}
              tone="primary"
            />
            <StatTile
              label="可用 API Keys"
              value={overview ? number(overview.apiKeyCount) : "--"}
              hint="按部署环境分别管理"
              icon={KeyRound}
              tone="success"
            />
            <StatTile
              label="工作区"
              value={<span className="block truncate">{overview?.activeOrganization?.name ?? "--"}</span>}
              hint={overview?.activeOrganization
                ? `${ROLE_LABEL[overview.activeOrganization.role] ?? overview.activeOrganization.role} 权限`
                : "登录后显示权限"}
              icon={UsersRound}
              tone="warning"
            />
          </div>

          {statsError ? (
            <Alert>
              <AlertDescription>{statsError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="近 14 天消耗"
              value={charts ? number(windowCredits) : "--"}
              hint="已结算额度"
              icon={ReceiptText}
            />
            <StatTile
              label="近 14 天请求"
              value={charts ? number(windowRequests) : "--"}
              hint="流式请求在结束后计入"
              icon={Activity}
              tone="primary"
            />
            <StatTile
              label="累计已用"
              value={usedCredits == null ? "--" : number(usedCredits)}
              hint="工作区额度账户"
              icon={Gauge}
            />
            <StatTile
              label="主模型"
              value={leadModel ? <span className="block truncate font-mono text-lg">{leadModel.model}</span> : "--"}
              hint={leadModel && mixTotal > 0 ? `占近 14 天消耗 ${percent((leadModel.credits / mixTotal) * 100)}` : "暂无模型占比"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>近 14 天消耗</CardTitle>
                <CardDescription>按日汇总的已结算额度，用来看趋势而不是逐条请求。</CardDescription>
              </CardHeader>
              <CardContent>
                {hasTrend && charts ? (
                  <TrendSparkline points={charts.daily} />
                ) : (
                  <ConsoleEmptyState title="暂无消耗趋势" description="近 14 天还没有已结算请求。" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>用量构成</CardTitle>
                <CardDescription>近 14 天额度占比，只保留头部模型。</CardDescription>
              </CardHeader>
              <CardContent>
                {modelMix.length === 0 || mixTotal <= 0 ? (
                  <ConsoleEmptyState title="暂无构成" description="有结算用量后会显示模型占比。" />
                ) : (
                  <ul className="space-y-3">
                    {modelMix.map((item) => {
                      const share = mixTotal > 0 ? (item.credits / mixTotal) * 100 : 0;
                      return (
                        <li key={item.model}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate font-mono text-xs text-ink-800">{item.model}</span>
                            <span className="shrink-0 text-xs text-ink-500">{percent(share)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                            <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(share, 2)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ConsolePage>
  );
}
