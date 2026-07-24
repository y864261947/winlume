"use client";

import Link from "next/link";
import { LoaderCircle, LogOut, UserRound, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { useModals } from "@/components/providers";
import { formatBalance } from "@/lib/account";

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

/** Settings stub — reuses account + balance from ModalProvider / @/lib/account. */
export default function StudioSettingsPage() {
  const { account, accountLoading, balanceConfig, openLogin, refreshAccount } = useModals();
  const signOutAction = useSignOutAction();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-bold tracking-tight text-ink-950">设置</h1>
        <p className="mt-2 text-sm text-ink-500">账户与工作台偏好（更多选项将陆续补充）。</p>

        <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-900">账户</h2>

          {accountLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-ink-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在同步账户…
            </div>
          ) : account ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">
                    {account.display_name || account.username}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    @{account.username}
                    {account.email ? ` · ${account.email}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-canvas px-4 py-3">
                <Wallet className="h-4 w-4 text-primary-500" />
                <span className="text-sm text-ink-600">余额</span>
                <span className="ml-auto font-mono text-sm font-semibold text-ink-900">
                  {formatBalance(account.quota, balanceConfig)}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void refreshAccount();
                  }}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink-700 transition hover:bg-canvas"
                >
                  刷新余额
                </button>
                <button
                  type="button"
                  disabled={signOutAction.pending}
                  onClick={() => {
                    void signOutAction.run();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink-700 transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signOutAction.pending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  退出登录
                </button>
              </div>
              {signOutAction.failed && (
                <p role="alert" className="text-xs text-rose-600">
                  退出失败，请重试
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-ink-500">尚未登录。登录后可查看余额与使用记录。</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openLogin("login")}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink-800 transition hover:bg-canvas"
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => openLogin("register")}
                  className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
                >
                  注册
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-xs text-ink-400">
          需要浏览应用超市？
          <Link href="/products" className="ml-1 text-primary-600 hover:underline">
            前往产品目录
          </Link>
        </p>
      </div>
    </div>
  );
}
