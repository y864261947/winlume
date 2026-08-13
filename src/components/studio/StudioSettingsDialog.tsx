"use client";

import { Check, SlidersHorizontal, UserRound, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Modal, { ModalCloseButton } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { useModals } from "@/components/providers";
import { formatBalance } from "@/lib/account";
import {
  FALLBACK_DEFAULT_MODEL,
  getDefaultModel,
  setDefaultModel,
} from "@/lib/studio/prefs";
import { cn } from "@/lib/utils";

type SettingsSection = "account" | "preferences";

const nav: Array<{ id: SettingsSection; label: string; icon: typeof UserRound }> = [
  { id: "account", label: "账户", icon: UserRound },
  { id: "preferences", label: "偏好", icon: SlidersHorizontal },
];

export default function StudioSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { account, accountLoading, balanceConfig, refreshAccount } = useModals();
  const [section, setSection] = useState<SettingsSection>("account");
  const [modelDraft, setModelDraft] = useState(FALLBACK_DEFAULT_MODEL);
  const [modelSaved, setModelSaved] = useState(false);
  const [modelHydrated, setModelHydrated] = useState(false);

  useEffect(() => {
    if (open) {
      setSection("account");
      const timer = window.setTimeout(() => {
        setModelDraft(getDefaultModel());
        setModelHydrated(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    document.body.style.removeProperty("pointer-events");
    return undefined;
  }, [open]);

  const saveModel = useCallback(() => {
    const next = modelDraft.trim() || FALLBACK_DEFAULT_MODEL;
    setDefaultModel(next);
    setModelDraft(next);
    setModelSaved(true);
    window.setTimeout(() => setModelSaved(false), 1600);
  }, [modelDraft]);

  return (
    <Modal open={open} onClose={onClose} label="设置" size="onboarding">
      <div className="flex h-[min(560px,calc(100dvh-4rem))] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_28px_80px_-24px_rgba(36,30,54,0.4)]">
        <div className="flex shrink-0 items-center justify-between px-5 py-3.5">
          <h2 className="text-sm font-medium text-[#241E36]">设置</h2>
          <ModalCloseButton onClose={onClose} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[12.5rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-1 border-r border-[#ece7df] bg-[#faf8f5] p-3">
            <p className="px-2.5 pb-2 pt-1 text-xs font-medium text-[#8A8298]">通用</p>
            {nav.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:outline-none",
                    active
                      ? "bg-white font-medium text-[#241E36] shadow-sm"
                      : "text-[#615A73] hover:bg-white/80",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </aside>

          <section className="min-h-0 overflow-y-auto p-6">
            {section === "account" ? (
              <div>
                <h2 className="text-base font-semibold text-[#241E36]">账户</h2>
                {accountLoading ? (
                  <p className="mt-6 text-sm text-[#8A8298]">正在同步账户…</p>
                ) : account ? (
                  <div className="mt-6 flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-sm font-bold text-white">
                          {(account.display_name || account.username).slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#241E36]">
                            {account.display_name || account.username}
                          </p>
                          <p className="truncate text-xs text-[#8A8298]">
                            {account.email || `@${account.username}`}
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm">
                        <Link href="/account">管理</Link>
                      </Button>
                    </div>
                    <div className="h-px bg-[#ece7df]" />
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm text-[#615A73]">
                        <Wallet className="size-4" />
                        余额
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-[#241E36]">
                          {formatBalance(account.quota, balanceConfig)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void refreshAccount()}
                        >
                          刷新
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-[#8A8298]">登录后可查看账户与余额。</p>
                )}
              </div>
            ) : (
              <div>
                <h2 className="text-base font-semibold text-[#241E36]">偏好</h2>
                <p className="mt-1 text-sm text-[#8A8298]">新对话使用的默认模型，保存在本机。</p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="studio-default-model"
                    value={modelHydrated ? modelDraft : ""}
                    onChange={(event) => {
                      setModelDraft(event.target.value);
                      setModelSaved(false);
                    }}
                    placeholder={FALLBACK_DEFAULT_MODEL}
                    disabled={!modelHydrated}
                    className="studio-search-field h-9 min-w-0 flex-1 rounded-[12px] bg-[#f7f4ef] px-3 font-mono text-sm text-[#241E36] placeholder:text-[#8A8298] disabled:opacity-60"
                  />
                  <Button
                    type="button"
                    onClick={saveModel}
                    disabled={!modelHydrated}
                    className="border-0 shadow-none"
                  >
                    {modelSaved ? <Check data-icon="inline-start" /> : null}
                    {modelSaved ? "已保存" : "保存"}
                  </Button>
                </div>
                <p className="mt-3 text-xs text-[#8A8298]">回退默认：{FALLBACK_DEFAULT_MODEL}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
