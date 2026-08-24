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
  "h-10 cursor-pointer rounded-[12px] px-2.5 text-[14px] text-[#241E36] outline-none focus:bg-[#ebe4d8] focus:outline-none focus-visible:outline-none data-[highlighted]:bg-[#ebe4d8]";

export default function StudioAccountControl() {
  const { account, accountLoading, balanceConfig, openLogin } = useModals();
  const signOutAction = useSignOutAction();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const avatarLetter = (account?.display_name || account?.username || "W")
    .trim()
    .charAt(0)
    .toUpperCase();
  const balanceLabel = account
    ? account.email || formatBalance(account.quota, balanceConfig)
    : "";

  const menu = (
    <DropdownMenuContent
      side="right"
      align="end"
      sideOffset={8}
      className="studio-account-menu w-[214px] rounded-[18px] border border-[#d4cec4] bg-[#fffdfb] p-1.5 shadow-[0_20px_50px_-16px_rgba(36,30,54,0.45),0_1px_0_rgba(255,255,255,0.8)_inset]"
    >
      {account ? (
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="truncate text-sm font-medium text-[#241E36]">
            {account.display_name || account.username}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[#8A8298]">{balanceLabel}</p>
        </div>
      ) : null}
      <DropdownMenuGroup>
        <DropdownMenuItem
          className={menuItemClass}
          onSelect={() => {
            window.setTimeout(() => setSettingsOpen(true), 10);
          }}
        >
          <Settings2 className="size-4 text-[#615A73]" />
          设置
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link href="/account">
            <UserRound className="size-4 text-[#615A73]" />
            个人中心
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link href="/account/wallet">
            <Wallet className="size-4 text-[#615A73]" />
            钱包与用量
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator className="mx-1 my-1 bg-[#e6e0d6]" />
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
          <LogOut className="size-4 text-[#615A73]" />
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
      {account ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={`${account.display_name || account.username} · ${balanceLabel}`}
              aria-label="打开账户菜单"
              className="studio-mode-avatar inline-flex size-9 items-center justify-center rounded-full text-sm font-bold outline-none transition-transform duration-100 ease-out active:scale-[0.97]"
            >
              {avatarLetter}
            </button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      ) : accountLoading ? (
        <div
          className="size-9 animate-pulse rounded-full bg-white/20"
          aria-label="正在加载账户"
        />
      ) : (
        <button
          type="button"
          onClick={() => openLogin("login")}
          title="登录"
          aria-label="登录"
          className="studio-mode-avatar studio-mode-avatar-guest inline-flex size-9 items-center justify-center rounded-full outline-none transition-transform duration-100 ease-out active:scale-[0.97]"
        >
          <UserRound className="size-4" />
        </button>
      )}
      <StudioSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
