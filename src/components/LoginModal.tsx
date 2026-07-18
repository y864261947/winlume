"use client";

import { type FormEvent, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Modal, { ModalCloseButton } from "./Modal";
import LogoMark from "./LogoMark";
import { login, register } from "@/lib/account";
import { useModals } from "./providers";

type Mode = "login" | "register";

interface LoginModalProps { open: boolean; initialMode: Mode; onClose: () => void; }

const inputCls = "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

export default function LoginModal({ open, initialMode, onClose }: LoginModalProps) {
  return <Modal open={open} onClose={onClose} label="登录或注册"><LoginForm key={initialMode} initialMode={initialMode} onClose={onClose} /></Modal>;
}

function LoginForm({ initialMode, onClose }: { initialMode: Mode; onClose: () => void }) {
  const { completeLogin, refreshAccount } = useModals();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    setPending(true); setError(""); setNotice("");
    try {
      if (mode === "login") {
        const account = await login(username, password);
        completeLogin(account);
        setNotice("登录成功，账户已连接。");
        window.setTimeout(onClose, 800);
        void refreshAccount();
      } else {
        await register({ username, password, email, display_name: displayName || username });
        setNotice("注册成功，请使用新账户登录。");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求未完成，请稍后重试。");
    } finally { setPending(false); }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-ink-950/15">
      <div className="flex items-start justify-between"><div className="flex items-center gap-2.5"><LogoMark /><div><p className="text-base font-semibold text-ink-900">{mode === "login" ? "登录 WinLume" : "注册 WinLume"}</p><p className="text-xs text-ink-400">使用已有 API 网关账户</p></div></div><ModalCloseButton onClose={onClose} /></div>
      <div className="mt-5 grid grid-cols-2 rounded-lg bg-canvas p-1 text-sm ring-1 ring-line">
        {(["login", "register"] as Mode[]).map((item) => <button key={item} type="button" disabled={pending} onClick={() => { setMode(item); setError(""); setNotice(""); }} className={`rounded-md py-1.5 transition ${mode === item ? "bg-surface font-medium text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}>{item === "login" ? "登录" : "注册"}</button>)}
      </div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block"><span className="mb-1.5 block text-xs text-ink-500">用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} minLength={1} maxLength={20} required autoComplete="username" placeholder="输入用户名" className={inputCls} /></label>
        {mode === "register" && <><label className="block"><span className="mb-1.5 block text-xs text-ink-500">邮箱</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" placeholder="name@example.com" className={inputCls} /></label><label className="block"><span className="mb-1.5 block text-xs text-ink-500">显示名称（可选）</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={20} placeholder="用于页面显示" className={inputCls} /></label></>}
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-500">密码</span>
          <span className="relative block">
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} minLength={6} maxLength={20} required autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="6 至 20 位密码" className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "隐藏密码" : "显示密码"} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 transition hover:text-ink-700">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        {mode === "register" && (
          <label className="block"><span className="mb-1.5 block text-xs text-ink-500">确认密码</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? "text" : "password"} minLength={6} maxLength={20} required autoComplete="new-password" placeholder="再次输入密码" className={inputCls} /></label>
        )}
        {error && <p role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
        {notice && <p role="status" className="flex gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</p>}
        <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary-500/25 transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60">{pending && <LoaderCircle className="h-4 w-4 animate-spin" />}{pending ? "正在验证" : mode === "login" ? "登录" : "创建账户"}</button>
      </form>
      <p className="mt-4 text-center text-xs leading-5 text-ink-400">账户、余额和可用模型由 API 网关提供。手机验证码与第三方 OAuth 将在对应网关能力启用后接入。</p>
    </div>
  );
}
