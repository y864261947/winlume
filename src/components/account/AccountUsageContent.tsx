"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { getConsoleOverview } from "@/lib/console/client";
import type { ConsoleOverview } from "@/lib/console/types";

function number(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export default function AccountUsageContent() {
  const [overview, setOverview] = useState<ConsoleOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getConsoleOverview().then((result) => {
      if (active) setOverview(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "无法加载用量。");
    });
    return () => { active = false; };
  }, []);

  return (
    <ConsolePage title="用量" description="查看已结算请求的额度消耗和请求量。流式请求在结束后计入统计。">
      {!overview && !error ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" /> 正在加载用量…</div> : null}
      {error ? <ConsoleEmptyState title="用量暂不可用" description={error} /> : null}
      {overview ? <>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">已结算额度</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{number(overview.wallet.usedCredits)}</p></div>
          <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">近 14 天请求</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{number(overview.usage.reduce((total, point) => total + point.requests, 0))}</p></div>
          <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">平均每请求</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{number(overview.usage.reduce((total, point) => total + point.requests, 0) ? overview.usage.reduce((total, point) => total + point.credits, 0) / overview.usage.reduce((total, point) => total + point.requests, 0) : 0)}</p></div>
        </div>
        {overview.usage.some((point) => point.requests > 0) ? <div className="mt-7 overflow-x-auto border border-line bg-surface"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-line bg-canvas text-xs text-ink-500"><tr><th className="px-4 py-3">日期</th><th className="px-4 py-3">请求数</th><th className="px-4 py-3">已结算额度</th></tr></thead><tbody className="divide-y divide-line">{overview.usage.map((point) => <tr key={point.date}><td className="px-4 py-3 text-ink-800">{point.date}</td><td className="px-4 py-3 font-mono text-ink-700">{number(point.requests)}</td><td className="px-4 py-3 font-mono text-ink-700">{number(point.credits)}</td></tr>)}</tbody></table></div> : <div className="mt-7"><ConsoleEmptyState title="暂无已结算请求" description="API 请求完成后会在这里按天汇总。" /></div>}
      </> : null}
    </ConsolePage>
  );
}
