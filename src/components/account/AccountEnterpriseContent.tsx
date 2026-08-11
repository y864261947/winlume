"use client";

import Link from "next/link";
import { Building2, LoaderCircle } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { listConsoleKeys } from "@/lib/console/client";
import type { ConsoleOrganization } from "@/lib/console/types";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";

type EnterpriseBillingRequest = {
  id: string;
  organizationId: string;
  companyName: string;
  taxId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  estimatedMonthlySpendCredits: number | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

const statusLabels: Record<EnterpriseBillingRequest["status"], string> = {
  pending: "审核中",
  approved: "已通过",
  rejected: "未通过",
};

const statusStyles: Record<EnterpriseBillingRequest["status"], string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-900",
  rejected: "border-rose-200 bg-rose-50 text-rose-900",
};

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "--"
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

async function fetchExistingRequest(organizationId: string): Promise<EnterpriseBillingRequest | null> {
  const response = await fetch(`/api/console/enterprise-billing?organizationId=${encodeURIComponent(organizationId)}`, {
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "无法加载对公结算申请状态。");
  return body.request ?? null;
}

function StatusCard({ request }: { request: EnterpriseBillingRequest }) {
  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-950">{request.companyName}</p>
          <p className="mt-1 text-xs text-ink-500">提交于 {date(request.createdAt)}</p>
        </div>
        <span className={`border px-2.5 py-1 text-xs font-medium ${statusStyles[request.status]}`}>
          {statusLabels[request.status]}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-500">联系人</dt>
          <dd className="mt-1 text-ink-800">
            {request.contactName} · {request.contactEmail}
            {request.contactPhone ? ` · ${request.contactPhone}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">统一社会信用代码</dt>
          <dd className="mt-1 text-ink-800">{request.taxId ?? "--"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">预估月消耗（Credits）</dt>
          <dd className="mt-1 text-ink-800">{request.estimatedMonthlySpendCredits ?? "--"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">备注</dt>
          <dd className="mt-1 text-ink-800">{request.notes ?? "--"}</dd>
        </div>
      </dl>
      {request.status === "pending" ? (
        <p className="mt-4 text-xs leading-5 text-ink-500">我们会尽快人工审核并通过联系邮箱与你确认，请保持联系方式畅通。</p>
      ) : null}
      {request.status === "approved" ? (
        <p className="mt-4 text-xs leading-5 text-ink-500">申请已通过，我们会通过联系邮箱与你对接线下签约与对公结算事宜。</p>
      ) : null}
      {request.status === "rejected" ? (
        <div className="mt-4 border border-rose-100 bg-rose-50/60 px-3 py-2">
          <p className="text-xs font-medium text-rose-900">未通过原因</p>
          <p className="mt-1 text-xs leading-5 text-rose-800">{request.reviewNotes ?? "未提供具体原因，可联系支持了解详情。"}</p>
        </div>
      ) : null}
    </div>
  );
}

function RequestForm({
  organizationId,
  onSubmitted,
}: {
  organizationId: string;
  onSubmitted: (request: EnterpriseBillingRequest) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [estimatedMonthlySpend, setEstimatedMonthlySpend] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyName.trim() || !contactName.trim() || !contactEmail.trim()) {
      setError("请填写公司名称、联系人姓名与联系邮箱。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/console/enterprise-billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          companyName: companyName.trim(),
          taxId: taxId.trim() || null,
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || null,
          estimatedMonthlySpendCredits: estimatedMonthlySpend.trim() ? Number(estimatedMonthlySpend.trim()) : null,
          notes: notes.trim() || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "提交失败，请稍后重试。");
      onSubmitted(body.request as EnterpriseBillingRequest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-line bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink-800">
          公司名称
          <input
            autoFocus
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            maxLength={200}
            placeholder="例如：示例科技有限公司"
            className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
          />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          统一社会信用代码（可选）
          <input
            value={taxId}
            onChange={(event) => setTaxId(event.target.value)}
            maxLength={64}
            className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
          />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          联系人姓名
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            maxLength={120}
            className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
          />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          联系邮箱
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            maxLength={320}
            className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
          />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          联系电话（可选）
          <input
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            maxLength={40}
            className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
          />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          预估月消耗（Credits，可选）
          <input
            type="number"
            min="0"
            step="0.01"
            value={estimatedMonthlySpend}
            onChange={(event) => setEstimatedMonthlySpend(event.target.value)}
            className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium text-ink-800">
        备注（可选）
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={4000}
          rows={3}
          placeholder="补充说明业务场景、预期上线时间等信息"
          className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
        />
      </label>
      <p className="mt-3 text-xs leading-5 text-ink-500">
        提交后由 Reizo 团队人工审核，通过后我们会通过联系邮箱与你对接线下签约与对公结算事宜（当前不支持自动开票）。
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60"
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          提交申请
        </button>
      </div>
    </form>
  );
}

export default function AccountEnterpriseContent() {
  const [organizations, setOrganizations] = useState<ConsoleOrganization[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [existingRequest, setExistingRequest] = useState<EnterpriseBillingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // listConsoleKeys() also returns the caller's accessible organizations —
      // reused here purely for that list, mirroring ConsoleKeysContent's switcher.
      const result = await listConsoleKeys();
      setOrganizations(result.organizations);
      const nextOrganizationId = result.organizations[0]?.id ?? null;
      setOrganizationId(nextOrganizationId);
      if (nextOrganizationId) {
        setExistingRequest(await fetchExistingRequest(nextOrganizationId));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法加载工作区信息。");
    } finally {
      setLoading(false);
    }
  }, []);

  const switchOrganization = useCallback(async (nextOrganizationId: string) => {
    setOrganizationId(nextOrganizationId);
    setLoading(true);
    setError(null);
    try {
      setExistingRequest(await fetchExistingRequest(nextOrganizationId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法加载对公结算申请状态。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrganizations(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOrganizations]);

  const activeOrganization = organizationId ? organizations?.find((org) => org.id === organizationId) ?? null : null;
  const canManage = activeOrganization?.role === "owner" || activeOrganization?.role === "admin";
  const showForm = !existingRequest || existingRequest.status === "rejected";

  return (
    <ConsolePage
      title="对公结算"
      description="面向企业客户的额度合作：提交企业信息与预估用量，由 Reizo 团队人工审核，通过后走线下签约（暂不支持自动开票）。"
    >
      {loading && organizations === null ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-ink-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> 正在加载…
        </div>
      ) : null}

      {organizations !== null && organizations.length === 0 ? (
        <ConsoleEmptyState
          title="需要先创建工作区"
          description="对公结算面向组织级的工作区，请先在“团队”页面创建或加入一个工作区，再回来提交申请。"
        />
      ) : null}

      {organizations !== null && organizations.length === 0 ? (
        <div className="mt-4 flex justify-center">
          <Link href="/account/team" className="inline-flex items-center gap-2 bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800">
            <Building2 className="h-4 w-4" /> 前往创建工作区
          </Link>
        </div>
      ) : null}

      {organizations !== null && organizations.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-ink-600">
            <span>工作区</span>
            <select
              aria-label="选择工作区"
              value={organizationId ?? ""}
              onChange={(event) => void switchOrganization(event.target.value)}
              className="border border-line bg-canvas px-2 py-1.5 text-sm text-ink-700 outline-none focus:border-ink-500"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          ) : null}

          {!canManage ? (
            <p className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              你可以查看该工作区的对公结算申请状态，但只有工作区 owner 或 admin 可以提交申请。
            </p>
          ) : null}

          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ink-500">
              <LoaderCircle className="h-4 w-4 animate-spin" /> 正在加载…
            </div>
          ) : (
            <>
              {existingRequest ? <StatusCard request={existingRequest} /> : null}
              {canManage && showForm && organizationId ? (
                <RequestForm organizationId={organizationId} onSubmitted={(request) => setExistingRequest(request)} />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </ConsolePage>
  );
}
