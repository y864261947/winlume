"use client";

import { Check, Copy, Mail, Share2, UserPlus } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useModals } from "@/components/providers";
import { ConsolePage } from "@/components/console/ConsolePage";

export default function AccountInviteContent() {
  const { account, openLogin } = useModals();
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState(false);
  const inviteCode = useMemo(() => account ? `REIZO-${account.id.replace(/-/g, "").slice(0, 8).toUpperCase()}` : "", [account]);
  const inviteUrl = origin && inviteCode ? `${origin}/?invite=${inviteCode}` : "";

  if (!account) return <ConsolePage title="邀请好友"><section className="reizo-account-login"><UserPlus aria-hidden /><h2>登录后邀请好友</h2><p>分享给团队成员或朋友，一起体验 REIZO。</p><button className="ac-button" type="button" onClick={() => openLogin("login")}>登录账户 ↗</button></section></ConsolePage>;

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("请复制邀请链接", inviteUrl);
    }
  }

  async function shareInvite() {
    if (navigator.share && inviteUrl) {
      try {
        await navigator.share({ title: "加入 Reizo", text: "邀请你一起体验 Reizo AI 能力。", url: inviteUrl });
        return;
      } catch {
        // 用户主动取消系统分享时，保留当前页面即可。
        return;
      }
    }
    await copyInvite();
  }

  return (
    <ConsolePage title="邀请好友">
      <div className="account-invite">
      <section className="ac-referral-hero"><div><span className="ac-status">奖励计划筹备中</span><h2>邀请好友，<br />一起发现更多创作可能。</h2><p>专属邀请码：{inviteCode}<br />可分享体验链接，奖励条件与发放规则将在活动开放前公布。</p></div><div className="ac-invitation-card">
        <h3>你的专属邀请链接</h3>
        <div className="account-invite-link"><input readOnly value={inviteUrl || "正在生成邀请链接…"} aria-label="邀请链接" /><button type="button" onClick={() => void copyInvite()} disabled={!inviteUrl}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? "已复制" : "复制链接"}</button></div>
        <div className="account-invite-actions"><button type="button" onClick={() => void shareInvite()}><Share2 aria-hidden />立即分享</button><a href={`mailto:?subject=${encodeURIComponent("邀请你加入 Reizo")}&body=${encodeURIComponent(`邀请你体验 Reizo AI 能力：${inviteUrl}`)}`}><Mail aria-hidden />邮件邀请</a></div>
      </div></section>
      <div className="ac-simple-note"><h3>邀请奖励待开放</h3><p>实际奖励金额、有效邀请条件和发放时间，以活动公布的正式规则为准。</p></div>
      </div>
    </ConsolePage>
  );
}
