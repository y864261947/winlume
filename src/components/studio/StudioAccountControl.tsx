"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { LoaderCircle, LogOut, Settings2, UserRound, Wallet } from "lucide-react";
import { useModals } from "@/components/providers";
import { formatBalance } from "@/lib/account";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StudioSettingsDialog from "./StudioSettingsDialog";

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

const menuItemClass =
  "h-10 cursor-pointer rounded-[12px] px-2.5 text-[14px] text-ink-900 shadow-none outline-none ring-0 focus:bg-[rgba(255,255,255,0.06)] focus:shadow-none focus:outline-none focus:ring-0 focus-visible:bg-[rgba(255,255,255,0.06)] focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 data-[highlighted]:bg-[rgba(255,255,255,0.06)] data-[highlighted]:shadow-none data-[highlighted]:outline-none";

export default function StudioAccountControl() {
  const { account, accountLoading, balanceConfig, openLogin } = useModals();
  const signOutAction = useSignOutAction();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const avatarLetter = (account?.display_name || account?.username || "W")
    .trim()
    .charAt(0)
    .toUpperCase();
  const name = account?.display_name || account?.username || "";
  const balanceLabel = account
    ? account.email || formatBalance(account.quota, balanceConfig)
    : "";

  const menu = (
    <DropdownMenuContent
      side="top"
      align="start"
      sideOffset={8}
      className="studio-account-menu w-[214px] rounded-[18px] border border-line bg-surface p-1.5 shadow-[0_20px_50px_-16px_rgba(15,23,42,0.45)]"
    >
      <DropdownMenuGroup>
        <DropdownMenuItem
          className={menuItemClass}
          onSelect={() => {
            window.setTimeout(() => setSettingsOpen(true), 10);
          }}
        >
          <Settings2 className="size-4 text-ink-500" />
          设置
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link href="/account">
            <UserRound className="size-4 text-ink-500" />
            个人中心
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link href="/account/wallet">
            <Wallet className="size-4 text-ink-500" />
            钱包与用量
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator className="mx-1 my-1 bg-line" />
      <DropdownMenuItem
        disabled={signOutAction.pending}
        className={menuItemClass}
        onSelect={() => {
          void signOutAction.run();
        }}
      >
        {signOutAction.pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <LogOut className="size-4 text-ink-500" />
        )}
        退出登录
      </DropdownMenuItem>
      {signOutAction.failed ? (
        <p role="alert" className="px-2.5 py-1 text-xs text-[#EF4770]">
          退出失败，请重试
        </p>
      ) : null}
    </DropdownMenuContent>
  );

  return (
    <>
      <div className="w-full border-t border-line pt-3">
        {account ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={`${name} · ${balanceLabel}`}
                aria-label="打开账户菜单"
                className="studio-account-trigger flex w-full items-center gap-2.5 rounded-[18px] px-2 py-2 text-left shadow-none outline-none ring-0 transition-colors duration-150 hover:bg-canvas focus:outline-none focus-visible:bg-canvas focus-visible:outline-none focus-visible:ring-0 data-[state=open]:bg-canvas"
              >
                <span className="studio-user-avatar flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  {avatarLetter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">
                    {name}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-500">
                    {balanceLabel}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            {menu}
          </DropdownMenu>
        ) : accountLoading ? (
          <div
            className="h-12 animate-pulse rounded-[18px] bg-canvas"
            aria-label="正在加载账户"
          />
        ) : (
          <button
            type="button"
            onClick={() => openLogin("login")}
            className="flex w-full items-center gap-2.5 rounded-[18px] px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-canvas focus-visible:outline-none"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-medium text-ink-500">
              登
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-900">登录</span>
              <span className="text-[12px] text-ink-500">开始对话并保存作品</span>
            </span>
          </button>
        )}
      </div>
      <StudioSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
