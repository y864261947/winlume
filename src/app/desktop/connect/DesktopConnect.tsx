"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useModals } from "@/components/providers";

export default function DesktopConnect({ requestId }: { requestId: string }) {
  const { account, accountLoading, openLogin, signOut } = useModals();
  const [valid, setValid] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/desktop-auth/request?request=${encodeURIComponent(requestId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setValid(true); })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "无法读取登录请求。"); });
    return () => controller.abort();
  }, [requestId]);
  async function approve(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/desktop-auth/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登录未完成，请重试。");
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "网络连接失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
    <section className="w-full rounded-3xl border border-black/10 bg-white p-8 text-zinc-900 shadow-sm">
      <p className="mb-3 text-sm text-zinc-500">REIZO STUDIO</p>
      <h1 className="mb-4 text-2xl font-semibold">{done ? "工作台已获授权" : "登录桌面工作台"}</h1>
      {done ? <p role="status">请返回 Reizo Studio，工作台会自动完成登录。你可以关闭此页面。</p> : <>
        <p className="mb-3 text-sm leading-6 text-zinc-600">使用你的 Reizo 网页账号登录。请输入桌面工作台显示的确认码；仅批准你刚刚在自己设备上发起的请求。</p>
        <p className="mb-6 text-sm leading-6 text-zinc-600">登录后，工作台可使用当前工作区的模型、查看余额和充值记录，并按你的操作创建充值订单。付款仍需在网页收银台完成。</p>
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
        {!valid ? <p className="text-sm">{error ? "请从桌面工作台重新发起。" : "正在检查请求…"}</p> : accountLoading ? <p>正在读取账号…</p> : !account ?
          <button className="w-full rounded-full bg-zinc-900 px-5 py-3 text-white" onClick={() => openLogin()}>登录或注册 Reizo 账号</button> :
          <form onSubmit={approve} className="space-y-4">
            <div><p className="font-medium">{account.display_name || account.username}</p><p className="text-sm text-zinc-500">{account.email || account.username}</p></div>
            <label className="block text-sm">工作台确认码<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9} autoComplete="off" spellCheck={false} placeholder="ABCD-1234" required className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-lg tracking-widest" /></label>
            <button disabled={busy || code.replace(/-/g, "").length !== 8} className="w-full rounded-full bg-zinc-900 px-5 py-3 text-white disabled:opacity-50">{busy ? "正在授权…" : "确认登录工作台"}</button>
            <button type="button" disabled={busy} className="w-full text-sm text-zinc-600" onClick={() => { void signOut().catch(() => setError("退出失败，请重试。")); }}>换一个账号</button>
          </form>}
      </>}
    </section>
  </main>;
}
