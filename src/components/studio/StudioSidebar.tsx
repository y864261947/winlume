"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  LoaderCircle,
  LogOut,
  MessageSquarePlus,
  Settings,
  Sparkles,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";
import LogoMark from "@/components/LogoMark";
import { useModals } from "@/components/providers";
import { formatBalance } from "@/lib/account";
import { site } from "@/data/site";

const navItems = [
  { href: "/studio", label: "新对话", icon: MessageSquarePlus, exact: true },
  { href: "/studio/skills", label: "Skills", icon: Wrench, exact: false, disabled: true },
  { href: "/studio/artifacts", label: "作品", icon: FolderKanban, exact: false, disabled: true },
  { href: "/studio/settings", label: "设置", icon: Settings, exact: false },
] as const;

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

function navActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function StudioSidebar() {
  const pathname = usePathname();
  const { account, accountLoading, balanceConfig, openLogin } = useModals();
  const signOutAction = useSignOutAction();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-4">
        <Link href="/studio" className="flex min-w-0 items-center gap-2">
          <LogoMark size="sm" />
          <span className="truncate text-sm font-bold tracking-tight text-ink-950">
            {site.name}
          </span>
          <span className="rounded-md bg-primary-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary-600">
            Studio
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {navItems.map((item) => {
          const active = navActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          if ("disabled" in item && item.disabled) {
            return (
              <span
                key={item.href}
                title="即将上线"
                className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-300"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-primary-50 font-medium text-primary-700"
                  : "text-ink-700 hover:bg-canvas hover:text-ink-900"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary-500" : "text-ink-400"}`} />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4">
          <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-widest text-ink-400">
            最近
          </p>
          <p className="px-3 text-xs leading-5 text-ink-400">
            会话列表将在后续任务中接入。
          </p>
        </div>
      </nav>

      <div className="border-t border-line p-3">
        {account ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2">
              <UserRound className="h-4 w-4 shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                {account.display_name || account.username}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-1 text-xs text-ink-500">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-primary-500" />
              <span className="font-mono font-semibold text-ink-800">
                {formatBalance(account.quota, balanceConfig)}
              </span>
            </div>
            {signOutAction.failed && (
              <p role="alert" className="px-1 text-xs text-rose-600">
                退出失败，请重试
              </p>
            )}
            <button
              type="button"
              disabled={signOutAction.pending}
              onClick={() => {
                void signOutAction.run();
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm text-ink-700 transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signOutAction.pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              退出登录
            </button>
          </div>
        ) : accountLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-canvas" aria-label="正在加载账户" />
        ) : (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 px-1 text-xs leading-5 text-ink-500">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
              登录后可使用模型对话与余额。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openLogin("login")}
                className="rounded-lg border border-line py-2 text-sm text-ink-800 transition hover:bg-canvas"
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => openLogin("register")}
                className="rounded-lg bg-primary-500 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
              >
                注册
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
