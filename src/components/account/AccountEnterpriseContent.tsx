"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { listConsoleKeys } from "@/lib/console/client";
import type { ConsoleOrganization } from "@/lib/console/types";

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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{request.companyName}</CardTitle>
          <CardDescription>提交于 {date(request.createdAt)}</CardDescription>
        </div>
        <Badge variant={request.status === "approved" ? "success" : request.status === "rejected" ? "destructive" : "outline"}>
          {statusLabels[request.status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-ink-800">
          {request.contactName} · {request.contactEmail}
          {request.contactPhone ? ` · ${request.contactPhone}` : ""}
        </p>
        <p className="text-xs text-ink-500">统一社会信用代码 {request.taxId ?? "--"}</p>
        {request.status === "pending" ? (
          <p className="text-xs leading-5 text-ink-500">人工审核中，请保持联系邮箱畅通。</p>
        ) : null}
        {request.status === "approved" ? (
          <p className="text-xs leading-5 text-ink-500">已通过，我们会通过邮箱对接线下签约。当前不支持自动开票。</p>
        ) : null}
        {request.status === "rejected" ? (
          <Alert variant="destructive">
            <AlertDescription>{request.reviewNotes ?? "未提供具体原因，可联系支持了解详情。"}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>提交申请</CardTitle>
        <CardDescription>审核通过后走线下签约，暂不支持自动开票。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="company-name">公司名称</FieldLabel>
                <Input id="company-name" autoFocus value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={200} placeholder="例如：示例科技有限公司" />
              </Field>
              <Field>
                <FieldLabel htmlFor="tax-id">统一社会信用代码</FieldLabel>
                <Input id="tax-id" value={taxId} onChange={(event) => setTaxId(event.target.value)} maxLength={64} />
                <FieldDescription>可选。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-name">联系人姓名</FieldLabel>
                <Input id="contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={120} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-email">联系邮箱</FieldLabel>
                <Input id="contact-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={320} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-phone">联系电话</FieldLabel>
                <Input id="contact-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={40} />
                <FieldDescription>可选。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="monthly-spend">预估月消耗</FieldLabel>
                <Input id="monthly-spend" type="number" min="0" step="0.01" value={estimatedMonthlySpend} onChange={(event) => setEstimatedMonthlySpend(event.target.value)} />
                <FieldDescription>可选，单位 Credits。</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="notes">备注</FieldLabel>
              <textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={4000}
                rows={3}
                placeholder="补充业务场景或预期上线时间"
                className="flex min-h-20 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-950 shadow-sm outline-none placeholder:text-ink-400 focus-visible:ring-2 focus-visible:ring-primary-400"
              />
            </Field>
          </FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : <Building2 data-icon="inline-start" />}
              提交申请
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
      description="企业额度合作申请。通过后走线下签约，这里不处理日常充值和消耗。"
    >
      {loading && organizations === null ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> 正在加载…
        </div>
      ) : null}

      {organizations !== null && organizations.length === 0 ? (
        <div className="space-y-4">
          <ConsoleEmptyState
            title="需要先有工作区"
            description="对公结算面向组织工作区。先到团队页创建或加入，再回来提交。"
          />
          <div className="flex justify-center">
            <Button asChild>
              <Link href="/account/team">前往团队</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {organizations !== null && organizations.length > 0 ? (
        <div className="space-y-6">
          {organizations.length > 1 && organizationId ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>工作区</span>
              <Select value={organizationId} onValueChange={(value) => void switchOrganization(value)}>
                <SelectTrigger aria-label="选择工作区" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {organizations.map((organization) => (
                      <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!canManage ? (
            <Alert>
              <AlertDescription>你可以查看申请状态，只有工作区 owner 或 admin 可以提交。</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner /> 正在加载…
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
