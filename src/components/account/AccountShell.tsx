"use client";

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
  Settings2,
  Store,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useModals } from "@/components/providers";
import type { Audience } from "@/data/audience";

const navigation = [
  { href: "/account", label: "账户信息", mobileLabel: "账户", icon: LayoutDashboard, exact: true },
  { href: "/account/keys", label: "API Keys", mobileLabel: "Keys", icon: KeyRound },
  { href: "/account/wallet", aliases: ["/account/usage"], label: "钱包与用量", mobileLabel: "钱包", icon: WalletCards },
  { href: "/account/pricing", label: "我的计费", mobileLabel: "计费", icon: Receipt },
  { href: "/account/enterprise", label: "对公结算", mobileLabel: "对公", icon: Building2 },
  { href: "/account/personalization", label: "人格与工具", mobileLabel: "设置", icon: Settings2 },
  { href: "/account/team", label: "团队", mobileLabel: "团队", icon: UsersRound },
  { href: "/account/community", label: "交流社区", mobileLabel: "社区", icon: Store },
];

function selected(pathname: string, item: (typeof navigation)[number]) {
  const paths = [item.href, ...(item.aliases ?? [])];
  return paths.some((href) =>
    item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`),
  );
}

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { account, audience, openLogin, selectAudience } = useModals();
  const personalActive = audience !== "business";
  const [notice, setNotice] = useState("");

  function changeAudience(next: Audience) {
    selectAudience(next);
    setNotice(next === "personal" ? "已切换到个人版" : "已切换到企业版");
    window.setTimeout(() => setNotice(""), 1800);
  }

  const accountName = account
    ? account.display_name || account.username
    : null;
  const accountInitial = accountName ? accountName.slice(0, 1).toUpperCase() : "登";

  return (
    <div className="portal-home">
      <div className="portal-frame portal-account-frame">
        <div className="portal-nav-shell">
          <div className="portal-nav-shell-fill" aria-hidden />
          <header className="portal-nav" aria-label="主导航">
            <Link href="/" className="portal-brand">
              Reizo
            </Link>
            <div className="portal-switcher" role="group" aria-label="版本选择">
              <Link
                href="/"
                className={personalActive ? "is-active" : ""}
                onClick={() => changeAudience("personal")}
              >
                个人版
              </Link>
              <Link
                href="/business"
                className={!personalActive ? "is-active" : ""}
                onClick={() => changeAudience("business")}
              >
                企业版
              </Link>
            </div>
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
                <button
                  type="button"
                  className="portal-account"
                  onClick={() => openLogin("login")}
                >
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
            <nav aria-label="个人中心导航" className="portal-account-side-nav">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = selected(pathname, item);
                return (
                  <Link
                    key={`${item.label}-${item.href}`}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={active ? "is-active" : undefined}
                  >
                    <Icon aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
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
        {navigation.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = selected(pathname, item);
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active ? "is-active" : undefined}
            >
              <Icon aria-hidden />
              <span>{item.mobileLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
