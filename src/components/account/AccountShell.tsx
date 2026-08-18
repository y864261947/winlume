"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  CircleHelp,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Receipt,
  ScrollText,
  Settings2,
  Store,
  UsersRound,
  WalletCards,
  Wrench,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useModals } from "@/components/providers";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: typeof KeyRound;
  exact?: boolean;
  aliases?: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "账户",
    items: [{ href: "/account", label: "概览", mobileLabel: "账户", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "接入",
    items: [{ href: "/account/keys", label: "API Keys", mobileLabel: "Keys", icon: KeyRound }],
  },
  {
    label: "计费",
    items: [
      { href: "/account/wallet", aliases: ["/account/usage"], label: "钱包与用量", mobileLabel: "钱包", icon: WalletCards },
      { href: "/account/logs", label: "请求日志", mobileLabel: "日志", icon: ScrollText },
      { href: "/account/pricing", label: "我的计费", mobileLabel: "计费", icon: Receipt },
      { href: "/account/enterprise", label: "对公结算", mobileLabel: "对公", icon: Building2 },
    ],
  },
  {
    label: "工作区",
    items: [
      { href: "/account/personalization", label: "人格与工具", mobileLabel: "设置", icon: Settings2 },
      { href: "/account/team", label: "团队", mobileLabel: "团队", icon: UsersRound },
      { href: "/account/community", label: "交流社区", mobileLabel: "社区", icon: Store },
    ],
  },
];

const mobileItems = groups.flatMap((group) => group.items).slice(0, 5);

function isActive(pathname: string, item: NavItem) {
  const paths = [item.href, ...(item.aliases ?? [])];
  return paths.some((href) =>
    item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`),
  );
}

function AccountNav({
  pathname,
  onNavigate,
  isAdmin = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  isAdmin?: boolean;
}) {
  const navGroups = isAdmin
    ? [
        ...groups,
        {
          label: "平台",
          items: [{ href: "/account/skills", label: "Skill 配置", mobileLabel: "Skill", icon: Wrench }],
        },
      ]
    : groups;
  return (
    <nav aria-label="个人中心导航" className="portal-account-side-nav">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="portal-account-side-kicker px-2.5 pt-2">{group.label}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(active && "is-active")}
              >
                <Icon aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { account, openLogin } = useModals();
  const [notice, setNotice] = useState("");
  const isAdmin = account?.platform_role === "admin";
  const accountName = account ? account.display_name || account.username : null;
  const accountInitial = accountName ? accountName.slice(0, 1).toUpperCase() : "登";

  return (
    <div className="portal-home">
      <div className="portal-frame portal-account-frame">
        <div className="portal-nav-shell">
          <div className="portal-nav-shell-fill" aria-hidden />
          <header className="portal-nav" aria-label="主导航">
            <Link href="/" className="portal-brand">
              <Image className="portal-brand-mark" src="/brand/reizo-mark.png" alt="" width={32} height={32} priority />
              Reizo
            </Link>
            <nav className="portal-main-links" aria-label="页面导航">
              <Link href="/">首页</Link>
              <Link href="/products?cate=app">应用工具</Link>
              <Link href="/products?cate=api">模型</Link>
              <Link href="/docs">文档</Link>
            </nav>
            <div className="portal-user-links">
              <Link href="/studio">
                <LayoutGrid aria-hidden />
                Agent
              </Link>
              <button type="button" onClick={() => setNotice("暂无新的通知")}>
                <Bell aria-hidden />
                通知
              </button>
              {account ? (
                <Link href="/account" className="portal-account is-current">
                  <span>{accountInitial}</span>
                  {accountName}
                  <ChevronRight aria-hidden />
                </Link>
              ) : (
                <button type="button" className="portal-account" onClick={() => openLogin("login")}>
                  <span>登</span>
                  登录
                  <ChevronRight aria-hidden />
                </button>
              )}
            </div>
          </header>
        </div>

        {notice ? (
          <p className="portal-account-notice" role="status">
            {notice}
          </p>
        ) : null}

        <div className="portal-account-layout">
          <aside className="portal-account-side">
            <p className="portal-account-side-kicker">Account</p>
            <h2 className="portal-account-side-title">个人中心</h2>
            <AccountNav pathname={pathname} isAdmin={isAdmin} />
            <div className="portal-account-side-help">
              <p>帮助与支持</p>
              <Link href="/docs" target="_blank" rel="noreferrer">
                <BookOpen aria-hidden />
                文档中心
              </Link>
              <Link href="/account/community">
                <CircleHelp aria-hidden />
                联系支持
              </Link>
            </div>
          </aside>

          <main className="portal-account-main">{children}</main>
        </div>
      </div>

      <nav aria-label="个人中心导航" className="portal-account-mobile-nav">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active ? "is-active" : undefined}
            >
              <Icon aria-hidden />
              <span>{item.mobileLabel ?? item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
