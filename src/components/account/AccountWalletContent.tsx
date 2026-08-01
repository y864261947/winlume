"use client";

import Link from "next/link";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { getConsoleOverview, getConsoleWallet } from "@/lib/console/client";
import type { ConsoleOverview, ConsoleWalletDetails } from "@/lib/console/types";

function amount(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function date(value: string | null) {
  if (!value) return "--";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "--" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

const entryLabels: Record<string, string> = {
  opening_balance: "初始余额",
  credit: "入账",
  debit: "使用扣除",
  adjustment: "人工调整",
  refund: "退款",
  hold: "请求预留",
  release: "释放预留",
};

const orderLabels: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  failed: "支付失败",
  refunded: "已退款",
  cancelled: "已取消",
};

export default function AccountWalletContent() {
  const [details, setDetails] = useState<ConsoleWalletDetails | null>(null);
  const [overview, setOverview] = useState<ConsoleOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getConsoleWallet(), getConsoleOverview()])
      .then(([wallet, nextOverview]) => {
        if (!active) return;
        setDetails(wallet);
        setOverview(nextOverview);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "无法加载钱包。");
      });
    return () => { active = false; };
  }, []);

  return (
    <ConsolePage title="钱包与订阅" description="额度属于个人账户；工作区协作不会自动共享或扣除其他成员的余额。">
      {!details && !error ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" /> 正在加载钱包…</div>
      ) : null}
      {error ? <ConsoleEmptyState title="钱包暂不可用" description={error} /> : null}
      {details ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">可用额度</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{amount(details.wallet.availableCredits)}</p><p className="mt-1 text-xs text-ink-500">{details.wallet.currency}</p></div>
            <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">请求预留中</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{amount(overview?.wallet.reservedCredits ?? 0)}</p><p className="mt-1 text-xs text-ink-500">完成或失败后自动释放</p></div>
            <div className="border border-line bg-surface p-5"><p className="text-sm text-ink-500">累计已使用</p><p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{amount(overview?.wallet.usedCredits ?? 0)}</p><p className="mt-1 text-xs text-ink-500">以已结算用量为准</p></div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="border border-line bg-surface">
              <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4"><div><h2 className="text-sm font-semibold text-ink-950">最近账本记录</h2><p className="mt-1 text-xs text-ink-500">账本不可修改，余额以记录汇总为准。</p></div></div>
              {details.ledger.length === 0 ? <ConsoleEmptyState title="暂无账本记录" description="充值、用量结算或人工调整后会在此处显示。" /> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-line bg-canvas text-xs text-ink-500"><tr><th className="px-5 py-3">类型</th><th className="px-5 py-3">引用</th><th className="px-5 py-3">时间</th><th className="px-5 py-3 text-right">额度</th></tr></thead><tbody className="divide-y divide-line">{details.ledger.map((entry) => <tr key={entry.id}><td className="px-5 py-3 text-ink-800">{entryLabels[entry.type] ?? entry.type}</td><td className="max-w-48 truncate px-5 py-3 font-mono text-xs text-ink-500">{entry.reference ?? "--"}</td><td className="px-5 py-3 text-xs text-ink-500">{date(entry.createdAt)}</td><td className={`px-5 py-3 text-right font-mono ${entry.amountCredits > 0 ? "text-emerald-700" : "text-ink-800"}`}>{entry.amountCredits > 0 ? "+" : ""}{amount(entry.amountCredits)}</td></tr>)}</tbody></table></div>
              )}
            </section>

            <aside className="border border-line bg-surface p-5">
              <p className="text-sm font-medium text-ink-950">订阅</p>
              <p className="mt-3 text-xl font-semibold text-ink-950">{details.wallet.subscription.name}</p>
              <p className="mt-1 text-sm text-ink-500">{details.wallet.subscription.status === "active" ? "当前有效" : "未启用"}{details.wallet.subscription.renewsAt ? ` · ${new Date(details.wallet.subscription.renewsAt).toLocaleDateString("zh-CN")} 续期` : ""}</p>
              <Link href="/account/api" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-ink-950">查看计费与 API <ArrowUpRight className="h-4 w-4" /></Link>
            </aside>
          </div>

          <section className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><h2 className="text-sm font-semibold text-ink-950">支付订单</h2><p className="mt-1 text-xs text-ink-500">支付渠道完成回调后，额度会写入上方账本。</p></div>
            {details.paymentOrders.length === 0 ? <ConsoleEmptyState title="暂无支付订单" description="创建充值或订阅订单后会显示在这里。" /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-line bg-canvas text-xs text-ink-500"><tr><th className="px-5 py-3">订单</th><th className="px-5 py-3">渠道</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">时间</th><th className="px-5 py-3 text-right">金额</th></tr></thead><tbody className="divide-y divide-line">{details.paymentOrders.map((order) => <tr key={order.id}><td className="px-5 py-3 font-mono text-xs text-ink-700">{order.reference}</td><td className="px-5 py-3 text-ink-700">{order.provider}</td><td className="px-5 py-3 text-ink-700">{orderLabels[order.status] ?? order.status}</td><td className="px-5 py-3 text-xs text-ink-500">{date(order.paidAt ?? order.createdAt)}</td><td className="px-5 py-3 text-right font-mono text-ink-800">{order.amount.toFixed(2)} {order.currency}</td></tr>)}</tbody></table></div>
            )}
          </section>
        </div>
      ) : null}
    </ConsolePage>
  );
}
