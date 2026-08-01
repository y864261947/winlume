"use client";

import Link from "next/link";
import { ArrowUpRight, Heart, Settings2, UsersRound, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { getConsoleOverview } from "@/lib/console/client";
import type { ConsoleOverview } from "@/lib/console/types";

function value(number: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number);
}

function metric(number: number | undefined) {
  return typeof number === "number" ? value(number) : "--";
}

const services = [
  { href: "/account/wallet", title: "钱包与用量", description: "查看余额、账本记录与 API 消耗。", icon: WalletCards, tone: "bg-sky-100 text-sky-700", label: "查看用量" },
  { href: "/account/team", title: "团队与权限", description: "邀请成员并管理协作范围。", icon: UsersRound, tone: "bg-emerald-100 text-emerald-700", label: "管理团队" },
  { href: "/account/community", title: "收藏与历史", description: "快速回到常用 API、工具和预设。", icon: Heart, tone: "bg-orange-100 text-orange-700", label: "查看收藏" },
];

export default function AccountOverview() {
  const [overview, setOverview] = useState<ConsoleOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getConsoleOverview().then((next) => { if (active) setOverview(next); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "账户信息暂不可用。 "); });
    return () => { active = false; };
  }, []);

  return <div className="border border-line bg-surface/65 p-5 sm:p-7 lg:min-h-[calc(100dvh-8.875rem)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm text-ink-500">个人版 / 个人中心 / 账户信息</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">账户与个人中心</h1>
        <p className="mt-2 text-base text-ink-600">管理你的账户、余额、团队与常用工具，一切状态清晰可见。</p>
      </div>
      <Link href="/account/personalization" className="inline-flex h-10 items-center gap-2 bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600"><Settings2 className="h-4 w-4" />编辑个人资料</Link>
    </div>

    {error ? <div className="mt-6 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">账户实时数据暂不可用，下面显示基础账户入口。</div> : null}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="border border-sky-200 bg-sky-50/75 p-5"><p className="text-sm text-ink-600">账户余额</p><p className="mt-2 font-mono text-2xl font-semibold text-ink-950">{metric(overview?.wallet.availableCredits)}</p><p className="mt-1 text-xs text-ink-500">{overview?.wallet.currency ?? "credits"}</p></div>
        <div className="border border-emerald-200 bg-emerald-50/75 p-5"><p className="text-sm text-ink-600">可用 API Keys</p><p className="mt-2 font-mono text-2xl font-semibold text-ink-950">{metric(overview?.apiKeyCount)}</p><p className="mt-1 text-xs text-ink-500">按部署环境分别管理</p></div>
        <div className="border border-orange-200 bg-orange-50/75 p-5"><p className="text-sm text-ink-600">工作区</p><p className="mt-2 truncate text-2xl font-semibold text-ink-950">{overview?.activeOrganization?.name ?? "--"}</p><p className="mt-1 text-xs text-ink-500">{overview?.activeOrganization ? `${overview.activeOrganization.role} 权限` : "登录后显示权限"}</p></div>
      </div>

      <section className="mt-5 border border-sky-200 bg-sky-50/55 p-5"><p className="text-xs font-semibold text-primary-600">ACCOUNT OVERVIEW</p><div className="mt-2 flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><h2 className="text-2xl font-semibold text-ink-950">把常用能力留在自己的工作空间</h2><p className="mt-2 text-sm leading-6 text-ink-600">在这里管理资料、支付方式、团队权限与常用工具收藏。</p></div><ol className="grid grid-cols-3 gap-2 text-center text-xs"><li className="border border-sky-200 bg-surface px-4 py-3"><strong className="block text-primary-600">01</strong><span className="mt-2 block text-ink-700">选择入口</span></li><li className="border border-sky-200 bg-surface px-4 py-3"><strong className="block text-primary-600">02</strong><span className="mt-2 block text-ink-700">完成配置</span></li><li className="border border-sky-200 bg-surface px-4 py-3"><strong className="block text-primary-600">03</strong><span className="mt-2 block text-ink-700">开始使用</span></li></ol></div></section>

      <section className="mt-7"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-ink-950">常用账户服务</h2><Link href="/account/keys" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">查看全部 <ArrowUpRight className="h-4 w-4" /></Link></div><div className="mt-4 grid gap-4 md:grid-cols-3">{services.map((service) => { const Icon = service.icon; return <Link key={service.title} href={service.href} className="border border-line bg-surface/90 p-5 transition hover:border-sky-300 hover:shadow-sm"><span className={`grid h-11 w-11 place-items-center ${service.tone}`}><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-lg font-semibold text-ink-950">{service.title}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-ink-600">{service.description}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary-600">{service.label} <ArrowUpRight className="h-4 w-4" /></span></Link>; })}</div></section>

      <section className="mt-7 flex flex-col justify-between gap-5 bg-ink-950 p-6 text-white sm:flex-row sm:items-center"><div><h2 className="text-xl font-semibold">需要进一步协助？</h2><p className="mt-2 text-sm text-ink-300">对账户、迁移或支付有疑问？支持团队随时协助。</p></div><Link href="/account/community" className="inline-flex h-11 items-center justify-center gap-2 bg-surface px-4 text-sm font-medium text-primary-600 hover:bg-canvas">联系支持团队 <ArrowUpRight className="h-4 w-4" /></Link></section>
  </div>;
}
