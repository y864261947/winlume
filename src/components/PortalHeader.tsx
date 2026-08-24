"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Crown, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { useModals } from "@/components/providers";

type NavItem = {
  href: string;
  label: string;
  active: (pathname: string, cate: string | null) => boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "首页", active: (pathname) => pathname === "/" },
  { href: "/products?cate=app", label: "应用工具", active: (pathname, cate) => pathname === "/products" && cate === "app" },
  { href: "/products?cate=api", label: "API模型", active: (pathname, cate) => pathname === "/products" && cate !== "app" },
  { href: "/docs", label: "文档", active: (pathname) => pathname === "/docs" || pathname.startsWith("/docs/") },
  { href: "/pricing", label: "计费标准", active: (pathname) => pathname === "/pricing" },
];

/** One portal header for the home, catalog, docs, pricing, and account surfaces. */
export default function PortalHeader({ productMode }: { productMode?: "app" | "api" }) {
  const pathname = usePathname();
  const { account, openLogin, openMembership } = useModals();
  const [notice, setNotice] = useState("");
  const accountName = account ? account.display_name || account.username : "";
  const accountInitial = accountName ? accountName.slice(0, 1).toUpperCase() : "登";

  return (
    <>
      <div className="portal-nav-shell">
        <div className="portal-nav-shell-fill" aria-hidden />
        <header className="portal-nav" aria-label="主导航">
          <Link href="/" className="portal-brand" aria-label="返回首页">
            <Image className="portal-brand-mark" src="/brand/reizo-mark.png" alt="" width={32} height={32} priority />
            Reizo
          </Link>
          <nav className="portal-main-links" aria-label="页面导航">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={item.active(pathname, pathname === "/products" ? productMode ?? "api" : null) ? "is-current" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="portal-user-links">
            <button type="button" className="portal-membership-entry" onClick={openMembership}><Crown aria-hidden />升级会员</button>
            <Link href="/studio" className={pathname.startsWith("/studio") ? "is-current" : undefined}>
              <LayoutGrid aria-hidden />
              Agent
            </Link>
            <button type="button" onClick={() => setNotice("暂无新的通知") }>
              <Bell aria-hidden />
              通知
            </button>
            {account ? (
              <Link href="/account" className={`portal-account${pathname.startsWith("/account") ? " is-current" : ""}`}>
                <span>{accountInitial}</span>{accountName}<ChevronRight aria-hidden />
              </Link>
            ) : (
              <button type="button" className="portal-account" onClick={() => openLogin("login")}>
                <span>{accountInitial}</span>登录<ChevronRight aria-hidden />
              </button>
            )}
          </div>
        </header>
      </div>
      {notice ? <p className="portal-account-notice" role="status">{notice}</p> : null}
    </>
  );
}
