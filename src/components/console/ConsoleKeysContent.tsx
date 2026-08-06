"use client";

import { Check, Copy, KeyRound, LoaderCircle, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { createConsoleKey, listConsoleKeys, revokeConsoleKey } from "@/lib/console/client";
import type { ConsoleApiKey, ConsoleOrganization } from "@/lib/console/types";
import { ConsoleEmptyState, ConsolePage } from "./ConsolePage";

function date(value: string | null) {
  if (!value) return "从未使用";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "--" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function KeyDialog({
  organizationId,
  onClose,
  onCreated,
}: {
  organizationId: string | null;
  onClose: () => void;
  onCreated: (key: ConsoleApiKey, secret: string) => void;
}) {
  const [name, setName] = useState("");
  const [modelScopes, setModelScopes] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [ipAllowList, setIpAllowList] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized) {
      setError("请输入密钥名称。");
      return;
    }
    let quota: number | null = null;
    const trimmedQuota = quotaLimit.trim();
    if (trimmedQuota) {
      const parsed = Number(trimmedQuota);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("额度上限必须是有效的非负数字。");
        return;
      }
      quota = parsed;
    }
    const scopes = modelScopes
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const ips = ipAllowList
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    setSubmitting(true);
    setError(null);
    try {
      const result = await createConsoleKey({
        name: normalized,
        organizationId,
        modelScopes: scopes,
        quotaLimit: quota,
        ipAllowList: ips,
      });
      onCreated(result.key, result.secret);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/35 p-4" role="presentation">
      <form onSubmit={submit} className="w-full max-w-md border border-line bg-surface shadow-xl" role="dialog" aria-modal="true" aria-labelledby="new-key-title">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="new-key-title" className="text-base font-semibold text-ink-950">新建 API Key</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-8 w-8 place-items-center text-ink-500 hover:bg-canvas hover:text-ink-950"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-sm font-medium text-ink-800">
            名称
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="例如：生产环境" className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500" />
          </label>
          <label className="block text-sm font-medium text-ink-800">
            允许的模型（可选，逗号分隔）
            <input value={modelScopes} onChange={(event) => setModelScopes(event.target.value)} placeholder="例如：gpt-4o, claude-3-5-sonnet" className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500" />
            <span className="mt-1 block text-xs text-ink-500">留空表示不限制可调用的模型。</span>
          </label>
          <label className="block text-sm font-medium text-ink-800">
            额度上限（可选，单位：Credits）
            <input type="number" min="0" step="0.01" value={quotaLimit} onChange={(event) => setQuotaLimit(event.target.value)} placeholder="留空表示不限额" className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500" />
          </label>
          <label className="block text-sm font-medium text-ink-800">
            IP 白名单（可选，逗号分隔）
            <input value={ipAllowList} onChange={(event) => setIpAllowList(event.target.value)} placeholder="例如：203.0.113.10, 203.0.113.0/24" className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500" />
            <span className="mt-1 block text-xs text-ink-500">留空表示不限制来源 IP。</span>
          </label>
          <p className="text-xs leading-5 text-ink-500">完整密钥只会显示一次。请保存到部署平台的受保护环境变量中。</p>
          {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className="border border-line px-3 py-2 text-sm text-ink-700 hover:bg-canvas">取消</button>
          <button disabled={submitting} className="inline-flex items-center gap-2 bg-ink-950 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60">
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            创建密钥
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ConsoleKeysContent() {
  const [keys, setKeys] = useState<ConsoleApiKey[]>([]);
  const [organizations, setOrganizations] = useState<ConsoleOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async (nextOrganizationId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listConsoleKeys(nextOrganizationId);
      setKeys(result.keys);
      setOrganizations(result.organizations);
      setOrganizationId(nextOrganizationId ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法加载 API Keys。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const activeOrganization = organizationId ? organizations.find((org) => org.id === organizationId) ?? null : null;
  const canManage = !organizationId || activeOrganization?.role === "owner" || activeOrganization?.role === "admin";

  async function revoke(key: ConsoleApiKey) {
    if (!window.confirm(`撤销 “${key.name}” 后，使用它的应用会立即失去访问权限。是否继续？`)) return;
    setRevoking(key.id);
    try {
      const result = await revokeConsoleKey(key.id);
      setKeys((current) => current.map((item) => item.id === result.key.id ? result.key : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "撤销失败，请重试。");
    } finally {
      setRevoking(null);
    }
  }

  async function copySecret() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <ConsolePage
      title="API Keys"
      description="为每个部署或集成创建单独密钥；可随时撤销，不会暴露其他密钥。"
      actions={canManage ? <button onClick={() => setShowDialog(true)} className="inline-flex items-center gap-2 bg-ink-950 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800"><Plus className="h-4 w-4" /> 新建 Key</button> : undefined}
    >
      {organizations.length > 0 ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-ink-600">
          <span>工作区</span>
          <select
            aria-label="选择工作区"
            value={organizationId ?? ""}
            onChange={(event) => void load(event.target.value || null)}
            className="border border-line bg-canvas px-2 py-1.5 text-sm text-ink-700 outline-none focus:border-ink-500"
          >
            <option value="">个人</option>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </div>
      ) : null}
      {!canManage ? <p className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">你可以查看该工作区的 API Key，但没有创建或撤销权限（仅 owner / admin 可管理）。</p> : null}
      {revealed ? (
        <section className="mb-6 border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-950">这是此密钥最后一次完整显示</p>
              <div className="mt-3 flex min-w-0 items-center gap-2 border border-emerald-200 bg-surface px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-sm text-ink-950">{revealed}</code>
                <button type="button" onClick={() => void copySecret()} aria-label="复制 API Key" className="grid h-7 w-7 shrink-0 place-items-center text-ink-600 hover:bg-canvas">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {error ? <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {loading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" /> 正在加载 API Keys…</div>
      ) : keys.length === 0 ? (
        <ConsoleEmptyState title="还没有 API Key" description="为服务端应用创建第一个 API Key。密钥只会在创建后显示一次。" />
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs font-medium text-ink-500"><tr><th className="px-4 py-3">名称</th>{organizationId ? <th className="px-4 py-3">所有者</th> : null}<th className="px-4 py-3">前缀</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">上次使用</th><th className="px-4 py-3">创建时间</th><th className="w-14 px-4 py-3"><span className="sr-only">操作</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {keys.map((key) => <tr key={key.id} className="text-ink-700"><td className="px-4 py-3 font-medium text-ink-950">{key.name}</td>{organizationId ? <td className="px-4 py-3 text-xs text-ink-500">{key.ownerName ?? "--"}</td> : null}<td className="px-4 py-3 font-mono text-xs">{key.prefix}...</td><td className="px-4 py-3"><span className={key.status === "active" ? "text-emerald-700" : "text-ink-500"}>{key.status === "active" ? "可用" : key.status === "revoked" ? "已撤销" : "已过期"}</span></td><td className="px-4 py-3 text-xs text-ink-500">{date(key.lastUsedAt)}</td><td className="px-4 py-3 text-xs text-ink-500">{date(key.createdAt)}</td><td className="px-4 py-3">{key.status === "active" && canManage ? <button type="button" disabled={revoking === key.id} onClick={() => void revoke(key)} aria-label={`撤销 ${key.name}`} title="撤销密钥" className="grid h-8 w-8 place-items-center text-ink-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">{revoking === key.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button> : null}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      {showDialog ? <KeyDialog organizationId={organizationId} onClose={() => setShowDialog(false)} onCreated={(key, secret) => { setKeys((current) => [key, ...current]); setRevealed(secret); setShowDialog(false); }} /> : null}
    </ConsolePage>
  );
}
