"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, Crown, LayoutGrid } from "lucide-react";
import { useModals } from "@/components/providers";

export type PortalNavCurrent = "home" | "apps" | "models" | "docs" | "pricing";

const MAIN_LINKS: Array<{ href: string; label: string; current: PortalNavCurrent }> = [
  { href: "/", label: "首页", current: "home" },
  { href: "/products?cate=app", label: "应用工具", current: "apps" },
  { href: "/products?cate=api", label: "API模型", current: "models" },
  { href: "/docs", label: "文档", current: "docs" },
  { href: "/pricing", label: "计费标准", current: "pricing" },
];

export default function PortalNav({
  current,
  accountActive = false,
  onNotify,
}: {
  current?: PortalNavCurrent;
  accountActive?: boolean;
  onNotify?: () => void;
}) {
  const { account, openLogin, openMembership } = useModals();
  const accountName = account ? account.display_name || account.username : null;
  const accountInitial = accountName ? accountName.slice(0, 1).toUpperCase() : "登";

  return (
    <div className="portal-nav-shell">
      <div className="portal-nav-shell-fill" aria-hidden />
      <header className="portal-nav" aria-label="主导航">
        <Link href="/" className="portal-brand" aria-label="返回首页">
          <Image className="portal-brand-mark" src="/brand/reizo-mark.png" alt="" width={32} height={32} priority />
          Reizo
        </Link>
        <nav className="portal-main-links" aria-label="页面导航">
          {MAIN_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={current === item.current ? "is-current" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="portal-membership-entry" onClick={openMembership}>
          <Crown aria-hidden />
          升级会员
        </button>
        <div className="portal-user-links">
          <Link href="/studio">
            <LayoutGrid aria-hidden />
            Agent
          </Link>
          <button type="button" onClick={() => onNotify?.()}>
            <Bell aria-hidden />
            通知
          </button>
          {accountName ? (
            <Link href="/account" className={accountActive ? "portal-account is-current" : "portal-account"}>
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
  );
}
