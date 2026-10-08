"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useModals } from "@/components/providers";
import { confirmEmailChange, removeProfileAvatar, saveProfileAvatar, saveProfileName, startEmailChange, type Account } from "@/lib/account";
import AccountAvatar from "./AccountAvatar";

export default function AccountProfileCard() {
  const { account, accountLoading, openLogin } = useModals();
  if (!account) return <section className="ac-profile-settings reizo-account-profile"><h2>个人资料</h2><p>{accountLoading ? "正在读取资料…" : "登录后管理头像、昵称和邮箱。"}</p><button className="ac-button" disabled={accountLoading} onClick={() => openLogin()}>登录账户 ↗</button></section>;
  return <ProfileEditor key={account.id} account={account} />;
}

function ProfileEditor({ account }: { account: Account }) {
  const { refreshAccount, signOut, openLogin } = useModals();
  const [editing, setEditing] = useState<"name" | "email" | "avatar" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [challenge, setChallenge] = useState<{ email: string; requiresCurrentEmailCode: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url); // eslint-disable-line react-hooks/set-state-in-effect -- URL lifetime is tied to the selected file
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const begin = (mode: typeof editing) => {
    setEditing(mode); setError(""); setNotice(""); setPassword(""); setCode(""); setOldCode(""); setChallenge(null); setFile(null); setPreview("");
    setName(account.display_name || account.username); setEmail("");
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  };
  const saved = async (message: string) => { await refreshAccount(); setEditing(null); setFile(null); setPreview(""); setNotice(message); };
  const sendCode = () => run(async () => {
    const result = await startEmailChange(challenge?.email || email, password);
    setChallenge(result); setCooldown(result.resendIn); setCode(""); setOldCode("");
    setNotice(result.requiresCurrentEmailCode ? "验证码已分别发往新邮箱和原邮箱，10 分钟内有效。" : "验证码已发往新邮箱，10 分钟内有效。");
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editing === "name") void run(async () => { await saveProfileName(name); await saved("昵称已更新。"); });
    if (editing === "avatar" && file) void run(async () => { await saveProfileAvatar(file); await saved("头像已更新。"); });
    if (editing === "email") {
      if (!challenge) void sendCode();
      else void run(async () => {
        await confirmEmailChange(challenge.email, code, oldCode);
        setPassword(""); setCode(""); setOldCode("");
        await signOut(); openLogin();
      });
    }
  };
  return <section className="ac-profile-settings reizo-account-profile">
    <h2>个人资料</h2>
    <div className="reizo-profile-identity"><AccountAvatar image={account.image} /><div><h3>{account.display_name || account.username}</h3><p>你的账户身份与联系方式</p></div><button className="ac-button" disabled={busy} onClick={() => begin("avatar")}>修改头像</button></div>
    <dl>
      <div><dt>昵称</dt><dd>{account.display_name || account.username}<button disabled={busy} onClick={() => begin("name")}>修改</button></dd></div>
      <div><dt>邮箱</dt><dd>{account.email || "尚未绑定"}<button disabled={busy} onClick={() => begin("email")}>{account.email ? "更换" : "绑定邮箱"}</button></dd></div>
      <div><dt>用户名</dt><dd>{account.username}</dd></div><div><dt>账户 ID</dt><dd>{account.id}</dd></div>
    </dl>
    {editing && <form className="reizo-profile-form" onSubmit={submit} aria-label={editing === "name" ? "修改昵称" : editing === "avatar" ? "修改头像" : "绑定或更换邮箱"}>
      <fieldset disabled={busy}>
        <legend>{editing === "name" ? "修改昵称" : editing === "avatar" ? "修改头像" : account.email ? "更换邮箱" : "绑定邮箱"}</legend>
        {editing === "name" && <label>昵称<input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={120} required autoComplete="nickname" /><small>保存后会同步到账户入口和登录欢迎语。</small></label>}
        {editing === "avatar" && <><label>选择图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const selected = event.target.files?.[0]; setError(""); setFile(null); setPreview("");
          if (!selected) return;
          if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 5 * 1024 * 1024) { setError("请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片。"); event.target.value = ""; return; }
          setFile(selected);
        }} /><small>支持 JPG、PNG、WebP，最大 5 MB；将从图片中心裁切为方形。</small></label>{file && preview && <Image className="reizo-profile-preview" src={preview} alt="新头像预览" width={96} height={96} unoptimized />}</>}
        {editing === "email" && <>
          <label>新邮箱<input autoFocus type="email" value={challenge?.email || email} disabled={!!challenge || busy} onChange={event => setEmail(event.target.value)} maxLength={320} required autoComplete="email" /></label>
          {account.has_password && <label>当前登录密码<input type="password" value={password} onChange={event => setPassword(event.target.value)} required={!challenge} autoComplete="current-password" maxLength={128} /></label>}
          {!account.has_password && <p className="reizo-profile-hint">将同时向原邮箱发送验证码，以确认是你本人操作。</p>}
          {challenge && <><label>新邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" maxLength={6} required /></label>{challenge.requiresCurrentEmailCode && <label>原邮箱验证码<input inputMode="numeric" value={oldCode} onChange={event => setOldCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" maxLength={6} required /></label>}<button type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown ? `${cooldown} 秒后可重发` : "重新发送验证码"}</button></>}
          <small>验证通过才会更新邮箱。更新后需重新登录，用户名和第三方登录关联保持不变。</small>
        </>}
        <div className="reizo-profile-actions"><button className="ac-button ac-button-primary" type="submit" disabled={busy || (editing === "avatar" && !file) || (editing === "email" && !challenge && cooldown > 0)}>{busy ? "正在处理…" : editing === "email" ? challenge ? "验证并保存邮箱" : cooldown ? `${cooldown} 秒后可发送` : "发送验证码" : "保存修改"}</button><button className="ac-button" type="button" onClick={() => begin(null)}>取消</button>{editing === "avatar" && account.image && <button type="button" onClick={() => void run(async () => { await removeProfileAvatar(); await saved("已恢复默认头像。"); })}>恢复默认头像</button>}</div>
      </fieldset>
    </form>}
    {error && <p className="reizo-profile-error" role="alert">{error}</p>}{notice && <p className="reizo-profile-notice" role="status">{notice}</p>}
    <Link href="/account/security">管理账户安全 →</Link>
  </section>;
}
