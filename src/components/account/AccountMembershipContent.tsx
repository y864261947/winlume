"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useModals } from "@/components/providers";
import { ConsolePage } from "@/components/console/ConsolePage";
import { getConsoleOverview } from "@/lib/console/client";
import type { ConsoleOverview } from "@/lib/console/types";

export default function AccountMembershipContent() {
  const { account, accountLoading, openLogin } = useModals();
  const [result, setResult] = useState<{ owner: string; overview?: ConsoleOverview; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = account?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getConsoleOverview().then(overview => { if (!cancelled) setResult({ owner: userId, overview }); }).catch(reason => { if (!cancelled) setResult({ owner: userId, error: reason instanceof Error ? reason.message : "会员信息暂不可用" }); });
    return () => { cancelled = true; };
  }, [userId, attempt]);
  const current = result?.owner === userId ? result : null;
  const wallet = current?.overview?.wallet;
  const subscription = wallet?.subscription;
  const allowance = wallet?.membershipAllowance;
  const active = subscription?.status === "active";
  const loading = accountLoading || (!!account && !current);
  const status = loading ? "读取中…" : !account ? "待登录" : current?.error ? "暂不可用" : active ? "已开通" : "未开通会员";
  const renewal = subscription?.renewsAt;
  return <ConsolePage title="我的会员">
    <section className="ac-current-plan"><span className="ac-status">{status}</span><h2>{loading ? "正在读取会员信息…" : !account ? "登录后查看当前方案" : current?.error ? "会员信息暂不可用" : active ? subscription.name : "当前按量使用"}</h2><p>{active ? "已开通方案与额度以当前账户记录为准。" : "会员购买待开放，你仍可以通过钱包充值，按实际用量使用。"}</p>
      <dl><div><dt>会员等级</dt><dd>{active ? subscription.name : "—"}</dd></div><div><dt>有效期至</dt><dd>{renewal ? new Date(renewal).toLocaleDateString("zh-CN") : "—"}</dd></div><div><dt>会员当期剩余</dt><dd>{allowance?.status === "active" ? new Intl.NumberFormat("zh-CN").format(Number(allowance.remainingUnits)) : "—"}</dd></div></dl>
      <div className="ac-plan-actions">{!account ? <button className="ac-button" disabled={accountLoading} onClick={() => openLogin()}>登录查看会员 ↗</button> : <Link className="ac-button" href="/account/wallet">前往钱包 ↗</Link>}<Link href="/pricing">比较会员方案 ↗</Link></div>
    </section>
    {current?.error && <p className="ac-note reizo-membership-error" role="alert">{current.error} <button className="ac-subtle" onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
    <div className="ac-simple-note"><h3>会员方案与账户余额，分别查看。</h3><p>Core、Plus、Pro、Max 的价格和权益说明可在会员与价格页比较；购买与权益发放尚待开放。现有余额和充值记录保留在钱包与账单中。</p></div>
  </ConsolePage>;
}
