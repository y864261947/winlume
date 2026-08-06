"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, LoaderCircle, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
            <StatTile
              label="可用额度"
              value={amount(details.wallet.availableCredits)}
              hint={details.wallet.currency}
              icon={WalletCards}
              tone="primary"
            />
            <StatTile
              label="请求预留中"
              value={amount(overview?.wallet.reservedCredits ?? 0)}
              hint="完成或失败后自动释放"
              icon={Clock3}
              tone="warning"
            />
            <StatTile
              label="累计已使用"
              value={amount(overview?.wallet.usedCredits ?? 0)}
              hint="以已结算用量为准"
              icon={TrendingUp}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>最近账本记录</CardTitle>
                <CardDescription>账本不可修改，余额以记录汇总为准。</CardDescription>
              </CardHeader>
              {details.ledger.length === 0 ? (
                <CardContent>
                  <ConsoleEmptyState title="暂无账本记录" description="充值、用量结算或人工调整后会在此处显示。" />
                </CardContent>
              ) : (
                <CardContent>
                  <Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>类型</TableHead>
                        <TableHead>引用</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead className="text-right">额度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.ledger.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-ink-800">{entryLabels[entry.type] ?? entry.type}</TableCell>
                          <TableCell className="max-w-48 truncate font-mono text-xs text-ink-500">{entry.reference ?? "--"}</TableCell>
                          <TableCell className="text-xs text-ink-500">{date(entry.createdAt)}</TableCell>
                          <TableCell className={`text-right font-mono ${entry.amountCredits > 0 ? "text-emerald-700" : "text-ink-800"}`}>
                            {entry.amountCredits > 0 ? "+" : ""}
                            {amount(entry.amountCredits)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>

            <Card className="h-fit">
              <CardContent>
                <p className="text-sm font-medium text-ink-950">订阅</p>
                <p className="mt-3 text-xl font-semibold text-ink-950">{details.wallet.subscription.name}</p>
                <p className="mt-1 text-sm text-ink-500">{details.wallet.subscription.status === "active" ? "当前有效" : "未启用"}{details.wallet.subscription.renewsAt ? ` · ${new Date(details.wallet.subscription.renewsAt).toLocaleDateString("zh-CN")} 续期` : ""}</p>
                <Link href="/account/api" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-ink-950">查看计费与 API <ArrowUpRight className="h-4 w-4" /></Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>支付订单</CardTitle>
              <CardDescription>支付渠道完成回调后，额度会写入上方账本。</CardDescription>
            </CardHeader>
            {details.paymentOrders.length === 0 ? (
              <CardContent>
                <ConsoleEmptyState title="暂无支付订单" description="创建充值或订阅订单后会显示在这里。" />
              </CardContent>
            ) : (
              <CardContent>
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单</TableHead>
                      <TableHead>渠道</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.paymentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs text-ink-700">{order.reference}</TableCell>
                        <TableCell className="text-ink-700">{order.provider}</TableCell>
                        <TableCell className="text-ink-700">{orderLabels[order.status] ?? order.status}</TableCell>
                        <TableCell className="text-xs text-ink-500">{date(order.paidAt ?? order.createdAt)}</TableCell>
                        <TableCell className="text-right font-mono text-ink-800">{order.amount.toFixed(2)} {order.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </div>
      ) : null}
    </ConsolePage>
  );
}
