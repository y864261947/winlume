"use client";

import { type FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CheckCircle2, ChevronLeft, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Modal, { ModalCloseButton } from "./Modal";
import {
  completeRecovery,
  identifyAccount,
  login,
  loginWithGitHub,
  loginWithGoogle,
  resendSignupCode,
  startRecovery,
  startSignup,
  verifySignup,
} from "@/lib/account";
import { useModals } from "./providers";

type Step = "identifier" | "password" | "oauth" | "register" | "verify" | "recover" | "recover-verify";

interface LoginModalProps {
  open: boolean;
  initialMode?: "login" | "register";
  onClose: () => void;
}

const inputCls = "login-modal-input w-full rounded-full px-4 py-[13px] text-sm outline-none";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

function GitHubGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.24 9.24 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
      />
    </svg>
  );
}

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

const copy: Record<Step, { title: string; subtitle: string; action: string }> = {
  identifier: { title: "登录或注册", subtitle: "", action: "继续" },
  password: { title: "欢迎回来", subtitle: "", action: "登录" },
  oauth: { title: "使用第三方账号继续", subtitle: "", action: "继续" },
  register: { title: "创建账户", subtitle: "", action: "创建账户" },
  verify: { title: "验证邮箱", subtitle: "验证码已发送", action: "验证" },
  recover: { title: "重置密码", subtitle: "", action: "发送验证码" },
  "recover-verify": { title: "设置新密码", subtitle: "", action: "保存新密码" },
};

export default function LoginModal({ open, onClose }: LoginModalProps) {
  return (
    <Modal open={open} onClose={onClose} label="登录或注册">
      <LoginForm onClose={onClose} />
    </Modal>
  );
}

function LoginForm({ onClose }: { onClose: () => void }) {
  const { completeLogin, refreshAccount, balanceConfig } = useModals();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("identifier");
  const [direction, setDirection] = useState(1);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [githubPending, setGithubPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const googleEnabled = Boolean(balanceConfig?.google_oauth_enabled);
  const githubEnabled = Boolean(balanceConfig?.github_oauth_enabled);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const goTo = (next: Step, dir: 1 | -1) => {
    setDirection(dir);
    setStep(next);
    setError("");
    setNotice("");
  };

  const finish = async (loginId: string, loginPassword: string, message: string) => {
    const account = await login(loginId, loginPassword);
    completeLogin(account);
    setNotice(message);
    window.setTimeout(onClose, 700);
    void refreshAccount();
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

  const onGitHub = async () => {
    setGithubPending(true);
    setError("");
    setNotice("");
    try {
      await loginWithGitHub();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "GitHub 登录未完成，请稍后重试。");
      setGithubPending(false);
    }
  };

  const submitIdentifier = async () => {
    const value = identifier.trim();
    if (!value) {
      setError("请输入邮箱或用户名。");
      return;
    }
    const result = await identifyAccount(value);
    setIdentifier(result.identifier);
    if (result.identifierType === "email") setEmail(result.identifier);
    if (result.status === "password") goTo("password", 1);
    else if (result.status === "oauth") goTo("oauth", 1);
    else if (result.status === "register") {
      setEmail(result.identifier);
      goTo("register", 1);
    } else {
      setError("没有这个用户名。请改用邮箱创建账户，或检查拼写。");
    }
  };

  const submitPassword = async () => {
    await finish(identifier, password, "已登录。");
  };

  const submitRegister = async () => {
    const normalized = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalized)) {
      setError("用户名需为 3 至 64 位，仅可使用小写字母、数字、点、下划线或连字符。");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 个字符。");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    const result = await startSignup({ email, username: normalized, password });
    setUsername(normalized);
    if (result.debugCode) setNotice(`开发模式验证码：${result.debugCode}`);
    if (result.status === "created") {
      await finish(email, password, "账户已创建并登录。");
      return;
    }
    setResendIn(60);
    setCode("");
    goTo("verify", 1);
  };

  const submitVerify = async () => {
    await verifySignup({ email, code: code.trim() });
    await finish(email, password, "账户已创建并登录。");
  };

  const submitRecover = async () => {
    const result = await startRecovery(identifier);
    if (result.debugCode) setNotice(`开发模式验证码：${result.debugCode}`);
    else setNotice(result.maskedEmail ? `验证码已发送至 ${result.maskedEmail}` : "如果该账户绑定了邮箱，验证码已经发出。");
    setResendIn(60);
    setCode("");
    goTo("recover-verify", 1);
  };

  const submitRecoverVerify = async () => {
    if (nextPassword.length < 8) {
      setError("密码至少 8 个字符。");
      return;
    }
    await completeRecovery({ identifier, code: code.trim(), password: nextPassword });
    await finish(identifier, nextPassword, "密码已更新，已为你登录。");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    if (step !== "verify" && step !== "recover" && step !== "recover-verify") setNotice("");
    try {
      if (step === "identifier") await submitIdentifier();
      else if (step === "password") await submitPassword();
      else if (step === "oauth") await onGoogle();
      else if (step === "register") await submitRegister();
      else if (step === "verify") await submitVerify();
      else if (step === "recover") await submitRecover();
      else await submitRecoverVerify();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求未完成，请稍后重试。");
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    setPending(true);
    setError("");
    try {
      if (step === "verify") {
        const result = await resendSignupCode(email);
        if (result.debugCode) setNotice(`开发模式验证码：${result.debugCode}`);
        else setNotice("验证码已重新发送。");
      } else {
        const result = await startRecovery(identifier);
        if (result.debugCode) setNotice(`开发模式验证码：${result.debugCode}`);
        else setNotice("验证码已重新发送。");
      }
      setResendIn(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能重发验证码。");
    } finally {
      setPending(false);
    }
  };

  const busy = pending || googlePending || githubPending;
  const current = copy[step];
  const showSocial = (googleEnabled || githubEnabled) && (step === "identifier" || step === "oauth");
  const canGoBack = step !== "identifier";
  const identityLabel = email || identifier;
  const stepTransition = reduceMotion
    ? { duration: 0.18, ease: "easeOut" as const }
    : { type: "spring" as const, bounce: 0, duration: 0.35 };

  return (
    <div className="login-modal relative overflow-hidden rounded-[32px] px-6 pb-6 pt-6 backdrop-blur-xl sm:px-7 sm:pb-7 sm:pt-7">
      <div className="login-modal-glow pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3">
          {canGoBack ? (
            <button
              type="button"
              className="login-modal-back flex h-10 w-10 items-center justify-center rounded-full"
              aria-label="返回"
              disabled={busy}
              onClick={() => {
                if (step === "recover-verify") goTo("recover", -1);
                else if (step === "recover") goTo("password", -1);
                else if (step === "verify") goTo("register", -1);
                else goTo("identifier", -1);
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="login-modal-brand-mark flex h-10 w-10 items-center justify-center rounded-full">
              <Image className="reizo-logo-day" src="/brand/logo-day.png" alt="Reizo" width={30} height={30} priority unoptimized />
              <Image className="reizo-logo-night" src="/brand/logo-night.png" alt="Reizo" width={30} height={30} priority unoptimized />
            </span>
          )}
          <div>
            <p className="login-modal-brand-name text-[15px] font-semibold uppercase leading-5 tracking-[0.18em]">REIZO</p>
            {current.subtitle ? (
              <p className="login-modal-subtitle mt-0.5 text-xs">{current.subtitle}</p>
            ) : null}
          </div>
        </div>
        <ModalCloseButton onClose={onClose} className="login-modal-close rounded-full" />
      </div>

      <h2 className="login-modal-heading mt-5 text-[22px] font-semibold tracking-[-0.02em]">{current.title}</h2>

      {step !== "identifier" && identityLabel && (
        <button
          type="button"
          className="login-modal-chip mt-3 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-left text-[13px]"
          onClick={() => goTo("identifier", -1)}
          disabled={busy}
        >
          <span className="min-w-0 truncate">{identityLabel}</span>
          <span className="login-modal-chip-edit shrink-0">更改</span>
        </button>
      )}

      {showSocial && (
        <div className="mt-5 flex flex-col gap-3">
          {googleEnabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onGoogle()}
              className="login-modal-google flex w-full items-center justify-center gap-2.5 rounded-full px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googlePending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GoogleGlyph className="h-4 w-4" />}
              {googlePending ? "正在跳转 Google…" : "使用 Google 继续"}
            </button>
          )}
          {githubEnabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onGitHub()}
              className="login-modal-google flex w-full items-center justify-center gap-2.5 rounded-full px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {githubPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GitHubGlyph className="h-4 w-4" />}
              {githubPending ? "正在跳转 GitHub…" : "使用 GitHub 继续"}
            </button>
          )}
          {step === "identifier" && (
            <div className="login-modal-divider flex items-center gap-3 text-[11px] tracking-wide">
              <i className="login-modal-divider-line h-px flex-1" />
              <span>或使用邮箱</span>
              <i className="login-modal-divider-line h-px flex-1" />
            </div>
          )}
        </div>
      )}

      <form onSubmit={(event) => void submit(event)} className="mt-4">
        <div className="login-modal-stage">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (dir: number) => ({
                  opacity: 0,
                  transform: `translateX(${(reduceMotion ? 0 : 18) * dir}px)`,
                }),
                center: { opacity: 1, transform: "translateX(0px)" },
                exit: (dir: number) => ({
                  opacity: 0,
                  transform: `translateX(${(reduceMotion ? 0 : 18) * -dir}px)`,
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
              className="flex flex-col gap-3"
            >
              {step === "identifier" && (
                <label className="login-modal-field block">
                  <span className="login-modal-label mb-1.5 block text-xs font-medium">邮箱或用户名</span>
                  <input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete="username"
                    inputMode="email"
                    autoFocus
                    required
                    placeholder="name@example.com"
                    className={inputCls}
                  />
                </label>
              )}

              {step === "password" && (
                <>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    autoComplete="current-password"
                    placeholder="输入密码"
                  />
                  <button
                    type="button"
                    className="login-modal-text-btn self-start text-xs"
                    disabled={busy}
                    onClick={() => goTo("recover", 1)}
                  >
                    忘记密码
                  </button>
                </>
              )}

              {step === "register" && (
                <>
                  <label className="login-modal-field block">
                    <span className="login-modal-label mb-1.5 block text-xs font-medium">用户名</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      minLength={3}
                      maxLength={64}
                      required
                      autoComplete="username"
                      autoFocus
                      placeholder="用于展示和工作区"
                      className={inputCls}
                    />
                  </label>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    autoComplete="new-password"
                    placeholder="至少 8 个字符"
                    minLength={8}
                  />
                  <PasswordField
                    label="确认密码"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    autoComplete="new-password"
                    placeholder="再输入一次密码"
                    minLength={8}
                  />
                </>
              )}

              {step === "verify" && (
                <CodeField value={code} onChange={setCode} />
              )}

              {step === "recover" && (
                <p className="login-modal-note text-sm leading-6">
                  验证码会发到这个账户绑定的邮箱。没有绑定邮箱时，无法通过邮件重置。
                </p>
              )}

              {step === "recover-verify" && (
                <>
                  <CodeField value={code} onChange={setCode} />
                  <PasswordField
                    value={nextPassword}
                    onChange={setNextPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    autoComplete="new-password"
                    placeholder="新密码，至少 8 个字符"
                    minLength={8}
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {error && (
          <p role="alert" className="login-modal-error mt-3 flex gap-2 rounded-2xl px-3.5 py-2.5 text-xs leading-5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="login-modal-notice mt-3 flex gap-2 rounded-2xl px-3.5 py-2.5 text-xs leading-5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {notice}
          </p>
        )}

        {step !== "oauth" && (
          <button
            type="submit"
            disabled={busy}
            className="login-modal-submit mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {pending ? "正在继续" : current.action}
          </button>
        )}

        {(step === "verify" || step === "recover-verify") && (
          <button
            type="button"
            className="login-modal-text-btn mt-3 w-full text-center text-xs"
            disabled={busy || resendIn > 0}
            onClick={() => void resend()}
          >
            {resendIn > 0 ? `${resendIn} 秒后可重发` : "重发验证码"}
          </button>
        )}

        {step === "register" && (
          <p className="login-modal-note mt-3 text-pretty text-center text-[11px] leading-5">
            创建账户即表示你同意我们的使用条款与隐私政策。
          </p>
        )}
      </form>
    </div>
  );
}

function PasswordField({
  label = "密码",
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
  minLength,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  placeholder: string;
  minLength?: number;
}) {
  return (
    <label className="login-modal-field block">
      <span className="login-modal-label mb-1.5 block text-xs font-medium">{label}</span>
      <span className="relative block">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={show ? "text" : "password"}
          minLength={minLength ?? 1}
          maxLength={128}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`${inputCls} pr-12`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "隐藏密码" : "显示密码"}
          className="login-modal-password-toggle absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function CodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="login-modal-field block">
      <span className="login-modal-label mb-1.5 block text-xs font-medium">验证码</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        required
        maxLength={6}
        placeholder="6 位数字"
        className={`${inputCls} login-modal-otp tracking-[0.28em]`}
      />
    </label>
  );
}
