"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Bot, ChevronDown, ChevronRight, Crown, KeyRound, LayoutDashboard, LogOut, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { useModals } from "@/components/providers";
import { logout } from "@/lib/account";

type NavItem = {
  href: string;
  label: string;
  active: (pathname: string, cate: string | null) => boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "首页", active: (pathname) => pathname === "/" },
  { href: "/products?cate=app", label: "应用工具", active: (pathname, cate) => pathname === "/products" && cate === "app" },
];

/** One portal header for the home, catalog, docs, pricing, and account surfaces. */
export default function PortalHeader({ productMode }: { productMode?: "app" | "api" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { account, openLogin, openMembership } = useModals();
  const [notice, setNotice] = useState("");
  const [apiMenuOpen, setApiMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; href: string }>>([]);
  const accountName = account ? account.display_name || account.username : "";
  const accountInitial = accountName ? accountName.slice(0, 1).toUpperCase() : "登";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/content", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((content: { notifications?: Array<{ id: string; title: string; body: string; href: string; enabled?: boolean }> } | null) => {
        if (!cancelled) setNotifications((content?.notifications ?? []).filter((notice) => notice.enabled !== false));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function signOut() {
    await logout();
    router.push("/");
    router.refresh();
  }

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
            <div
              className="portal-main-menu"
              onMouseEnter={() => setApiMenuOpen(true)}
              onMouseLeave={() => setApiMenuOpen(false)}
              onFocus={() => setApiMenuOpen(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setApiMenuOpen(false);
              }}
            >
              <Link
                href="/products?cate=api"
                className={pathname === "/products" && productMode !== "app" ? "is-current" : undefined}
                aria-expanded={apiMenuOpen}
              >
                API模型<ChevronDown aria-hidden />
              </Link>
              <div className={`portal-main-submenu${apiMenuOpen ? " is-open" : ""}`}>
                <Link href="/products?cate=api">全部模型</Link>
                <Link href="/docs">API 调用文档</Link>
              </div>
            </div>
            <Link href="/studio" className={`portal-agent-entry${pathname.startsWith("/studio") ? " is-current" : ""}`}>
              <Bot aria-hidden />
              智能体
            </Link>
          </nav>
          <button type="button" className="portal-membership-entry" onClick={openMembership}>
            <Crown aria-hidden />
            升级会员
          </button>
          <div className="portal-user-links">
            <div className="portal-notification-menu" onMouseEnter={() => setNotificationOpen(true)} onMouseLeave={() => setNotificationOpen(false)} onFocus={() => setNotificationOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setNotificationOpen(false); }}>
              <button type="button" aria-expanded={notificationOpen} onClick={() => setNotificationOpen((open) => !open)}><Bell aria-hidden />通知{notifications.length ? <i>{notifications.length}</i> : null}</button>
              <div className={`portal-notification-submenu${notificationOpen ? " is-open" : ""}`}>
                <strong>通知</strong>
                {notifications.length ? notifications.map((item) => <Link href={item.href || "/"} key={item.id}><b>{item.title}</b><span>{item.body}</span></Link>) : <p>暂无新的通知</p>}
              </div>
            </div>
            {account ? (
              <div
                className="portal-account-menu"
                onMouseEnter={() => setAccountMenuOpen(true)}
                onMouseLeave={() => setAccountMenuOpen(false)}
                onFocus={() => setAccountMenuOpen(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAccountMenuOpen(false);
                }}
              >
                <Link href="/account" className={`portal-account${pathname.startsWith("/account") ? " is-current" : ""}`} aria-expanded={accountMenuOpen}>
                  <span>{accountInitial}</span>{accountName}<ChevronRight aria-hidden />
                </Link>
                <div className={`portal-account-submenu${accountMenuOpen ? " is-open" : ""}`}>
                  <Link href="/account"><LayoutDashboard aria-hidden />个人中心</Link>
                  <Link href="/account/keys"><KeyRound aria-hidden />API Key</Link>
                  <Link href="/account/wallet"><WalletCards aria-hidden />钱包</Link>
                  <Link href="/studio"><Bot aria-hidden />工作区</Link>
                  <button type="button" onClick={() => void signOut()}><LogOut aria-hidden />退出登录</button>
                </div>
              </div>
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
