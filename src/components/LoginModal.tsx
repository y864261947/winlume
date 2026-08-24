"use client";

import { type FormEvent, useState } from "react";
import Image from "next/image";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Modal, { ModalCloseButton } from "./Modal";
import { login, loginWithGoogle, register } from "@/lib/account";
import { useModals } from "./providers";

type Mode = "login" | "register";

interface LoginModalProps { open: boolean; initialMode: Mode; onClose: () => void; }

const inputCls = "login-modal-input w-full rounded-xl border border-[#d9e5f2] bg-white/78 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-[#a7b4c7] outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.86)] transition focus:border-[#4793ea] focus:bg-white focus:ring-4 focus:ring-[#dcecff]";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.14 3.57-8.64Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3a7.2 7.2 0 0 1-10.78-3.8H1.3v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.29A7.2 7.2 0 0 1 4.92 12c0-.8.14-1.57.38-2.29V6.62H1.3A12 12 0 0 0 0 12c0 1.94.46 3.77 1.3 5.38l4-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.3 6.62l4 3.09A7.18 7.18 0 0 1 12 4.75Z" />
    </svg>
  );
}

export default function LoginModal({ open, initialMode, onClose }: LoginModalProps) {
  return <Modal open={open} onClose={onClose} label="登录或注册"><LoginForm key={initialMode} initialMode={initialMode} onClose={onClose} /></Modal>;
}

function LoginForm({ initialMode, onClose }: { initialMode: Mode; onClose: () => void }) {
  const { completeLogin, refreshAccount, balanceConfig } = useModals();
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
  const [googlePending, setGooglePending] = useState(false);
  const googleEnabled = Boolean(balanceConfig?.google_oauth_enabled);

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
        const account = await login(username, password);
        completeLogin(account);
        setNotice("账户已创建并登录。");
        window.setTimeout(onClose, 800);
        void refreshAccount();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求未完成，请稍后重试。");
    } finally { setPending(false); }
  };

  const onGoogle = async () => {
    setGooglePending(true);
    setError("");
    setNotice("");
    try {
      await loginWithGoogle();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google 登录未完成，请稍后重试。");
      setGooglePending(false);
    }
  };

  const busy = pending || googlePending;

  return (
    <div className="login-modal relative overflow-hidden rounded-[22px] border border-white/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(245,250,255,0.92))] p-5 shadow-[0_28px_70px_rgba(32,67,112,0.25),inset_0_1px_1px_rgba(255,255,255,0.95)] backdrop-blur-xl sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[#dceeff]/55 blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="login-modal-brand-mark flex h-10 w-10 items-center justify-center rounded-xl border border-white/90 bg-white/76 shadow-[0_8px_18px_rgba(45,105,195,0.16)]">
            <Image src="/brand/reizo-mark.png" alt="" width={30} height={30} priority />
          </span>
          <div>
            <p className="login-modal-brand-name text-[15px] font-semibold uppercase leading-5 tracking-[0.18em] text-[#102244]">REIZO</p>
            <p className="login-modal-subtitle mt-0.5 text-xs text-[#7585a0]">{mode === "login" ? "登录后继续你的 AI 工作流" : "创建账户，开始使用 AI 工作流"}</p>
          </div>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>
      <div className="login-modal-tabs relative mt-5 grid grid-cols-2 rounded-xl border border-white/85 bg-[#edf4fb]/78 p-1 text-sm shadow-[inset_0_1px_2px_rgba(83,123,168,0.1)]">
        {(["login", "register"] as Mode[]).map((item) => <button key={item} type="button" disabled={busy} onClick={() => { setMode(item); setError(""); setNotice(""); }} className={`login-modal-tab rounded-lg py-2 transition ${mode === item ? "is-active bg-white font-semibold text-[#143b73] shadow-[0_4px_12px_rgba(48,91,144,0.12)]" : "text-[#71819a] hover:text-[#294f83]"}`}>{item === "login" ? "登录" : "注册"}</button>)}
      </div>

      {googleEnabled && (
        <div className="mt-5 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGoogle()}
            className="login-modal-google flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#dbe6f3] bg-white/80 px-3 py-2.5 text-sm font-medium text-[#253b5d] shadow-[0_5px_14px_rgba(55,91,135,0.08)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {googlePending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GoogleGlyph className="h-4 w-4" />}
            {googlePending ? "正在跳转 Google…" : "使用 Google 继续"}
          </button>
          <div className="login-modal-divider flex items-center gap-3 text-[11px] tracking-wide text-[#a1aec1]">
            <span className="h-px flex-1 bg-[#dce6f2]" />
            <span>或使用密码</span>
            <span className="h-px flex-1 bg-[#dce6f2]" />
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="login-modal-field block"><span className="mb-1.5 block text-xs font-medium text-[#566884]">用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={64} required autoComplete="username" placeholder="输入用户名" className={inputCls} /></label>
        {mode === "register" && <><label className="login-modal-field block"><span className="mb-1.5 block text-xs font-medium text-[#566884]">邮箱</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" placeholder="name@example.com" className={inputCls} /></label><label className="login-modal-field block"><span className="mb-1.5 block text-xs font-medium text-[#566884]">显示名称（可选）</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={20} placeholder="用于页面显示" className={inputCls} /></label></>}
        <label className="login-modal-field block">
          <span className="mb-1.5 block text-xs font-medium text-[#566884]">密码</span>
          <span className="relative block">
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} minLength={mode === "login" ? 1 : 8} maxLength={128} required autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "输入密码" : "8 至 128 位密码"} className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "隐藏密码" : "显示密码"} className="login-modal-password-toggle absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#9aa9bc] transition hover:text-[#315a91]">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        {mode === "register" && (
          <label className="login-modal-field block"><span className="mb-1.5 block text-xs font-medium text-[#566884]">确认密码</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? "text" : "password"} minLength={8} maxLength={128} required autoComplete="new-password" placeholder="再次输入密码" className={inputCls} /></label>
        )}
        {error && <p role="alert" className="login-modal-error flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
        {notice && <p role="status" className="login-modal-notice flex gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</p>}
        <button type="submit" disabled={busy} className="login-modal-submit flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(125deg,#174dcb,#1f7ee5)] py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(33,99,213,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">{pending && <LoaderCircle className="h-4 w-4 animate-spin" />}{pending ? "正在验证" : mode === "login" ? "登录" : "创建账户"}</button>
      </form>
      <p className="login-modal-note mt-4 text-center text-xs leading-5 text-[#8b9ab0]">
        {googleEnabled
          ? "Google 登录会在首次使用时自动创建工作区；已有同邮箱账户会直接绑定。"
          : "迁移后的账户需要重新登录；第三方登录与安全因子将单独重新绑定。"}
      </p>
    </div>
  );
}
