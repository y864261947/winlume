"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  CircleHelp,
  KeyRound,
  LayoutDashboard,
  Settings2,
  Store,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { site } from "@/data/site";

const navigation = [
  { href: "/account", label: "账户信息", mobileLabel: "账户", icon: LayoutDashboard, exact: true },
  { href: "/account/keys", label: "API Keys", mobileLabel: "Keys", icon: KeyRound },
  { href: "/account/wallet", aliases: ["/account/usage"], label: "钱包与用量", mobileLabel: "钱包", icon: WalletCards },
  { href: "/account/personalization", label: "人格与工具", mobileLabel: "设置", icon: Settings2 },
  { href: "/account/team", label: "团队", mobileLabel: "团队", icon: UsersRound },
  { href: "/account/api", label: "API 文档", mobileLabel: "API", icon: BookOpen },
  { href: "/account/community", label: "交流社区", mobileLabel: "社区", icon: Store },
];

function selected(pathname: string, item: (typeof navigation)[number]) {
  const paths = [item.href, ...(item.aliases ?? [])];
  return paths.some((href) => item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
}

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-[linear-gradient(120deg,#edfaff_0%,#f7fcfc_54%,#fff7ed_100%)] text-ink-900 lg:flex lg:flex-col">
      <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center gap-5 px-4 sm:px-8">
          <Link href="/" className="text-xl font-semibold text-ink-950">{site.name}</Link>
          <div className="hidden border border-sky-200 bg-sky-50 p-0.5 text-sm sm:flex">
            <span className="bg-surface px-3 py-1 font-medium text-primary-600">个人版</span>
            <Link href="/business" className="px-3 py-1 text-ink-500 hover:text-ink-950">企业版</Link>
          </div>
          <nav aria-label="主导航" className="ml-auto hidden items-center gap-5 text-sm text-ink-700 lg:flex">
            <Link href="/" className="hover:text-primary-600">首页</Link>
            <Link href="/studio" className="hover:text-primary-600">AI 应用</Link>
            <Link href="/studio" className="hover:text-primary-600">智能体</Link>
            <Link href="/account/api" className="hover:text-primary-600">API</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-ink-600 lg:ml-6">
            <Link href="/studio" className="hidden items-center gap-1.5 hover:text-ink-950 sm:inline-flex"><LayoutDashboard className="h-4 w-4" />工作台</Link>
            <button type="button" aria-label="通知" title="通知" className="grid h-8 w-8 place-items-center text-ink-500 hover:bg-canvas hover:text-ink-950"><Bell className="h-4 w-4" /></button>
            <Link href="/account" className="font-medium text-ink-800 hover:text-primary-600">我的账户</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:flex-1 lg:pb-0">
        <aside className="sticky top-[92px] hidden h-[calc(100dvh-7.5rem)] w-[252px] shrink-0 overflow-y-auto border border-line bg-surface/75 p-3 lg:h-[calc(100dvh-8.875rem)] lg:block">
          <p className="px-2 pt-2 text-xs font-semibold text-primary-600">个人版 / 账户与个人中心</p>
          <h2 className="px-2 pb-3 pt-2 text-xl font-semibold text-ink-950">个人中心</h2>
          <nav aria-label="个人中心导航" className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = selected(pathname, item);
              return <Link key={`${item.label}-${item.href}`} href={item.href} aria-current={active ? "page" : undefined} className={`flex h-9 items-center gap-2 px-2.5 text-sm transition ${active ? "bg-sky-100 font-medium text-primary-600" : "text-ink-700 hover:bg-canvas hover:text-ink-950"}`}><Icon className="h-4 w-4" />{item.label}</Link>;
            })}
          </nav>
          <div className="mt-5 border-t border-line px-2 pt-4">
            <p className="text-sm font-semibold text-ink-900">帮助与支持</p>
            <Link href="/account/api" className="mt-3 flex items-center gap-2 text-sm text-ink-600 hover:text-primary-600"><BookOpen className="h-4 w-4" />文档中心</Link>
            <Link href="/account/community" className="mt-2 flex items-center gap-2 text-sm text-ink-600 hover:text-primary-600"><CircleHelp className="h-4 w-4" />联系支持</Link>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="hidden h-[50px] shrink-0 items-center bg-ink-950 px-6 text-xs text-ink-300 lg:flex">
        <div className="mx-auto flex w-full max-w-[1440px] items-center gap-3">
          <span className="font-medium text-ink-100">WINLUME</span>
          <span aria-hidden="true">·</span>
          <Link href="/products" className="hover:text-white">产品</Link>
          <span aria-hidden="true">·</span>
          <Link href="/account/api" className="hover:text-white">文档</Link>
          <span aria-hidden="true">·</span>
          <Link href="/account/community" className="hover:text-white">支持</Link>
          <span aria-hidden="true">·</span>
          <span>隐私与条款</span>
        </div>
      </footer>

      <nav aria-label="个人中心导航" className="sticky bottom-0 z-30 flex border-t border-line bg-surface px-2 py-2 lg:hidden">
        {navigation.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = selected(pathname, item);
          return <Link key={`${item.label}-${item.href}`} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-[11px] ${active ? "font-medium text-primary-600" : "text-ink-500"}`}><Icon className="h-4 w-4" /><span className="whitespace-nowrap">{item.mobileLabel}</span></Link>;
        })}
      </nav>
    </div>
  );
}
