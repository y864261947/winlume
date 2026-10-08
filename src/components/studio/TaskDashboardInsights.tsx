"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useModals } from "@/components/providers";
import { getConsoleOverview, getConsoleUsageLogs } from "@/lib/console/client";
import { remainingAllowancePercent } from "@/lib/billing/model";
import type { ConsoleWallet } from "@/lib/console/types";

export function compactTokens(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export function useDashboardUsage(revision: number) {
  const { account } = useModals();
  const owner = account?.id;
  const [data, setData] = useState<{ owner: string; wallet: ConsoleWallet | null; tokens: { input: number; output: number; count: number } | null } | null>(null);
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    Promise.allSettled([getConsoleOverview(), getConsoleUsageLogs(undefined, { type: "consume", pageSize: 50 })]).then(([overview, logs]) => {
      const items = logs.status === "fulfilled" ? logs.value.items.filter(row => row.type === "consume") : null;
      if (!cancelled) setData({ owner, wallet: overview.status === "fulfilled" ? overview.value.wallet : null,
        tokens: items ? { input: items.reduce((n, row) => n + row.promptTokens, 0), output: items.reduce((n, row) => n + row.completionTokens, 0), count: items.length } : null });
    });
    return () => { cancelled = true; };
  }, [owner, revision]);
  const current = data?.owner === owner ? data : null;
  const allowance = current?.wallet?.membershipAllowance;
  const percent = allowance ? remainingAllowancePercent(allowance) : null;
  return { ...current, allowance, percent, signedIn: !!account };
}

export default function TaskDashboardInsights({ usage, running, queued }: {
  usage: ReturnType<typeof useDashboardUsage>; running: number | null; queued: number | null;
}) {
  const tokens = usage.tokens;
  const total = tokens ? tokens.input + tokens.output : null;
  const angle = total && tokens ? tokens.input / total * 360 : 0;
  return <aside className="review-insights">
    <section className="review-insight-card">
      <div className="review-insight-heading"><h2>Token 消耗概览</h2><Link href="/account/logs">调用日志 ↗</Link></div>
      <small>最近 {tokens?.count ?? "—"} 条计费调用 · 最多 50 条</small>
      <strong className="review-token-total">{total === null ? "—" : compactTokens(total)}</strong>
      <div className="review-token-donut" data-empty={!total} style={{ "--token-angle": `${angle}deg` } as CSSProperties} role="img" aria-label={total === null ? "用量尚未同步" : `输入 ${tokens?.input}，输出 ${tokens?.output} Tokens`}>
        <div><strong>{total === null ? "—" : compactTokens(total)}</strong><span>Tokens</span></div>
      </div>
      <div className="review-token-legend"><p><i/>输入 Token <strong>{tokens ? compactTokens(tokens.input) : "—"}</strong></p><p><i/>输出 Token <strong>{tokens ? compactTokens(tokens.output) : "—"}</strong></p></div>
      <p className="review-insight-note">{tokens ? "工作区调用记录，不按任务状态分摊。" : usage.signedIn ? "用量暂未同步，可前往调用日志查看。" : "登录后查看用量。"}</p>
    </section>
    <Link href="/account/wallet" className="review-insight-card review-quota-card">
      <span className="review-quota-ring">{usage.percent === null ? "—" : `${Math.round(usage.percent)}%`}</span>
      <span><strong>会员剩余额度</strong><small>{usage.allowance?.status === "active" ? `${Number(usage.allowance.remainingUnits).toLocaleString()} / ${Number(usage.allowance.totalUnits).toLocaleString()} 点` : usage.allowance?.status === "not_configured" ? "尚未开通月度额度" : "额度尚未同步"}</small><em>查看钱包与会员 →</em></span>
    </Link>
    <section className="review-insight-card">
      <div className="review-insight-heading"><h2>并发任务</h2><span>当前运行</span></div>
      <strong className="review-token-total">{running ?? "—"}<small> 项</small></strong>
      <p className="review-insight-note">排队中 {queued ?? "—"} 项。执行上限尚未同步。</p>
    </section>
  </aside>;
}
