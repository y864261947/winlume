"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  Code2,
  LayoutGrid,
  LoaderCircle,
  Menu,
  Search,
  Sparkles,
  LogOut,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import MegaMenu from "./MegaMenu";
import LogoMark from "./LogoMark";
import { useModals } from "./providers";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scrollLock";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { formatBalance } from "@/lib/account";
import { categoriesByCate, cateTabs } from "@/data/taxonomy";
import { mainNav, site } from "@/data/site";

/** 退出登录动作：pending 防重复点击，失败时给出可见反馈。 */
function useSignOutAction() {
  const { signOut } = useModals();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useCallback(async () => {
    if (pending) return false;
    setPending(true);
    setFailed(false);
    try {
      await signOut();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending(false);
    }
  }, [pending, signOut]);
  return { pending, failed, run };
}

// 平台检测：SSR 默认展示 macOS 风格快捷键，hydration 后按真实平台校正
const noopSubscribe = () => () => {};
const getIsMacSnapshot = () => /Mac|iPhone|iPad/.test(window.navigator.userAgent);
const getIsMacServerSnapshot = () => true;

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openLogin, account, accountLoading, balanceConfig, industryPrefs, selectAudience } = useModals();
  const signOutAction = useSignOutAction();
  const pathname = usePathname();
  const router = useRouter();
  const isBusiness = pathname.startsWith("/business");
  const [expanded, setExpanded] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const switchAudience = () => {
    const next = isBusiness ? "personal" : "business";
    onClose();
    selectAudience(next, industryPrefs);
    router.push(next === "business" ? "/business" : "/");
  };

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlockBodyScroll();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useFocusTrap(panelRef, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] lg:hidden">
      <div className="modal-fade-in absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="菜单"
        tabIndex={-1}
        className="drawer-in absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col border-l border-line bg-surface outline-none"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <span className="flex items-center gap-2 font-semibold text-ink-900">
            <LogoMark size="sm" />
            {site.name}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭菜单"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 transition hover:bg-canvas hover:text-ink-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {mainNav.map((item) =>
            item.href === "#" ? (
              <span
                key={item.label}
                title="即将上线"
                className="block cursor-not-allowed rounded-lg px-3 py-2.5 text-sm text-ink-300"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className="block rounded-lg px-3 py-2.5 text-sm text-ink-700 transition hover:bg-canvas"
              >
                {item.label}
              </Link>
            ),
          )}

          <p className="px-3 pt-4 pb-2 font-mono text-[11px] uppercase tracking-widest text-ink-400">
            分类
          </p>
          {cateTabs.map((t) => (
            <div key={t.slug}>
              <button
                type="button"
                onClick={() => setExpanded((v) => (v === t.slug ? null : t.slug))}
                aria-expanded={expanded === t.slug}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-700 transition hover:bg-canvas"
              >
                {t.name}
                <ChevronDown
                  className={`h-4 w-4 text-ink-400 transition ${expanded === t.slug ? "rotate-180" : ""}`}
                />
              </button>
              {expanded === t.slug && (
                <div className="mb-1 ml-3 border-l border-line pl-3">
                  {categoriesByCate(t.slug).map((c) => (
                    <Link
                      key={c.slug}
                      href={`/products?cate=${t.slug}&tag=${c.slug}`}
                      onClick={onClose}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 transition hover:bg-canvas hover:text-ink-900"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          <p className="px-3 pt-4 pb-2 font-mono text-[11px] uppercase tracking-widest text-ink-400">
            版本
          </p>
          <button
            type="button"
            onClick={switchAudience}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink-700 transition hover:bg-canvas"
          >
            {isBusiness ? <Sparkles className="h-4 w-4 text-primary-500" /> : <Building2 className="h-4 w-4 text-primary-500" />}
            {isBusiness ? "切换到个人版" : "切换到企业版"}
          </button>
        </div>

        {account ? (
          <div className="space-y-3 border-t border-line p-4">
            <div className="flex items-center gap-2 text-sm">
              <UserRound className="h-4 w-4 shrink-0 text-ink-400" />
              <span className="truncate text-ink-700">{account.display_name || account.username}</span>
              <Wallet className="ml-auto h-3.5 w-3.5 shrink-0 text-primary-500" />
              <span className="font-mono text-xs font-semibold text-ink-800">{formatBalance(account.quota, balanceConfig)}</span>
            </div>
            {signOutAction.failed && <p role="alert" className="text-xs text-rose-600">退出失败，请重试</p>}
            <button
              type="button"
              disabled={signOutAction.pending}
              onClick={() => {
                void signOutAction.run().then((ok) => {
                  if (ok) onClose();
                });
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm text-ink-700 transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signOutAction.pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              退出登录
            </button>
          </div>
        ) : accountLoading ? (
          <div className="border-t border-line p-4">
            <span className="block h-9 animate-pulse rounded-lg bg-canvas" aria-label="正在加载账户" />
          </div>
        ) : (
          <div className="border-t border-line p-4">
            <button
              type="button"
              onClick={() => {
                onClose();
                openLogin();
              }}
              className="w-full rounded-full bg-primary-500 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
            >
              登录 / 注册
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SiteHeader() {
  const { account, accountLoading, balanceConfig, openLogin, openSearch, industryPrefs, selectAudience } = useModals();
  const signOutAction = useSignOutAction();
  const pathname = usePathname();
  const router = useRouter();
  const isBusiness = pathname.startsWith("/business");
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMac = useSyncExternalStore(noopSubscribe, getIsMacSnapshot, getIsMacServerSnapshot);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchAudience = () => {
    const next = isBusiness ? "personal" : "business";
    selectAudience(next, industryPrefs);
    router.push(next === "business" ? "/business" : "/");
  };

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setMegaOpen(false), 150);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  // MegaMenu 打开时按 ESC 关闭
  useEffect(() => {
    if (!megaOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMegaOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [megaOpen]);

  return (
    <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-xl">
      <div className="relative" onMouseLeave={scheduleClose}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <LogoMark />
            <span className="text-lg font-bold tracking-tight text-ink-950">
              {site.name}
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
            <button
              type="button"
              aria-expanded={megaOpen}
              aria-haspopup="true"
              onMouseEnter={() => {
                cancelClose();
                setMegaOpen(true);
              }}
              onClick={() => setMegaOpen((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition ${
                megaOpen ? "bg-canvas text-ink-900" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              分类
              <ChevronDown
                className={`h-3 w-3 transition ${megaOpen ? "rotate-180" : ""}`}
              />
            </button>
            <span onMouseEnter={() => setMegaOpen(false)} className="contents">
              {mainNav.map((item) => {
                if (item.href === "#") {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      disabled
                      title="即将上线"
                      className="cursor-not-allowed rounded-lg px-3 py-2 text-sm text-ink-300"
                    >
                      {item.label}
                    </button>
                  );
                }
                // 带 query 的入口（两个"超市"）由产品页内的筛选 chip 指示当前态，这里只高亮纯路径项
                const active = !item.href.includes("?") && pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? "bg-canvas font-medium text-ink-900"
                        : "text-ink-600 hover:bg-canvas hover:text-ink-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </span>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={openSearch}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-400 transition hover:border-line-strong hover:text-ink-600"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">搜索</span>
              <kbd className="hidden rounded border border-line bg-canvas px-1 font-mono text-[10px] md:inline">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>

            <button
              type="button"
              onClick={switchAudience}
              title={isBusiness ? "切换到个人版" : "切换到企业版"}
              className="hidden items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-600 transition hover:border-line-strong hover:text-ink-900 md:flex"
            >
              {isBusiness ? <Sparkles className="h-3.5 w-3.5 text-primary-500" /> : <Building2 className="h-3.5 w-3.5 text-primary-500" />}
              {isBusiness ? "个人版" : "企业版"}
            </button>

            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Github"
              className="hidden rounded-lg p-2 text-ink-500 transition hover:bg-canvas hover:text-ink-800 md:block"
            >
              <Code2 className="h-4.5 w-4.5" />
            </a>

            {account ? (
              <div className="hidden items-center gap-1.5 sm:flex">
                {signOutAction.failed && <span role="alert" className="text-xs text-rose-600">退出失败</span>}
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm">
                  <UserRound className="h-3.5 w-3.5 text-ink-400" />
                  <span className="max-w-20 truncate text-ink-700">{account.display_name || account.username}</span>
                  <span className="h-3 w-px bg-line" />
                  <Wallet className="h-3.5 w-3.5 text-primary-500" />
                  <span className="font-mono text-xs font-semibold text-ink-800">{formatBalance(account.quota, balanceConfig)}</span>
                </div>
                <button
                  type="button"
                  disabled={signOutAction.pending}
                  onClick={() => void signOutAction.run()}
                  title="退出登录"
                  aria-label="退出登录"
                  className="rounded-lg p-2 text-ink-400 transition hover:bg-canvas hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signOutAction.pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                </button>
              </div>
            ) : !accountLoading ? (
              <>
                <button type="button" onClick={() => openLogin()} className="hidden rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary-500/20 transition hover:bg-primary-600 sm:block">登录 / 注册</button>
              </>
            ) : <span className="hidden h-8 w-40 animate-pulse rounded-lg bg-canvas sm:block" aria-label="正在加载账户" />}

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="打开菜单"
              className="rounded-lg p-2 text-ink-700 transition hover:bg-canvas lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        <MegaMenu
          open={megaOpen}
          onEnter={cancelClose}
          onNavigate={() => setMegaOpen(false)}
        />
      </div>

      {/* 签名光谱发丝线 */}
      <div className="spectrum-bg h-[2px] w-full opacity-80" aria-hidden />

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
