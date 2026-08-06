"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface EnterpriseBillingRequest {
  id: string;
  organizationId: string;
  organizationName: string;
  companyName: string;
  taxId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  estimatedMonthlySpendCredits: number | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type PendingAction = { kind: "approved" | "rejected"; request: EnterpriseBillingRequest };

const PAGE_SIZE = 50;

const statusLabels: Record<EnterpriseBillingRequest["status"], string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

const statusVariants: Record<EnterpriseBillingRequest["status"], "outline" | "success" | "destructive"> = {
  pending: "outline",
  approved: "success",
  rejected: "destructive",
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("zh-CN");
}

export default function EnterpriseBillingRequestsTable() {
  const [requests, setRequests] = useState<EnterpriseBillingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Lightweight status-breakdown counts for the summary tiles, reusing the same list endpoint
  // (limit=1 just to read `total`) rather than adding a new aggregate endpoint.
  const [statusCounts, setStatusCounts] = useState<{ pending: number; approved: number; rejected: number } | null>(
    null,
  );

  const loadStatusCounts = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all(
        (["pending", "approved", "rejected"] as const).map((status) =>
          fetch(`/api/gateway-admin/billing-requests?status=${status}&limit=1&offset=0`, { cache: "no-store" }),
        ),
      );
      const [pendingBody, approvedBody, rejectedBody] = await Promise.all([
        pendingRes.json().catch(() => ({})),
        approvedRes.json().catch(() => ({})),
        rejectedRes.json().catch(() => ({})),
      ]);
      if (pendingRes.ok && approvedRes.ok && rejectedRes.ok) {
        setStatusCounts({
          pending: pendingBody.total ?? 0,
          approved: approvedBody.total ?? 0,
          rejected: rejectedBody.total ?? 0,
        });
      }
    } catch {
      // Summary tiles are non-critical; silently skip on failure.
    }
  }, []);

  const load = useCallback(async (currentStatus: StatusFilter, currentSearch: string, currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (currentStatus !== "all") params.set("status", currentStatus);
      if (currentSearch) params.set("search", currentSearch);
      const response = await fetch(`/api/gateway-admin/billing-requests?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "加载失败");
      setRequests(body.requests ?? []);
      setTotal(body.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search input -> search, resetting to the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void load(statusFilter, search, offset);
  }, [load, statusFilter, search, offset]);

  useEffect(() => {
    void loadStatusCounts();
  }, [loadStatusCounts]);

  const openAction = useCallback((kind: "approved" | "rejected", request: EnterpriseBillingRequest) => {
    setActionError(null);
    setReviewNotes("");
    setPending({ kind, request });
  }, []);

  const confirmPending = useCallback(async () => {
    if (!pending) return;
    setActionError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/gateway-admin/billing-requests/${pending.request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: pending.kind, reviewNotes: reviewNotes.trim() || null }),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(responseBody.error ?? "更新失败");
        return;
      }
      setPending(null);
      await Promise.all([load(statusFilter, search, offset), loadStatusCounts()]);
    } finally {
      setSaving(false);
    }
  }, [pending, reviewNotes, load, statusFilter, search, offset, loadStatusCounts]);

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + requests.length, total);
  const canPrev = offset > 0;
  const canNext = offset + requests.length < total;

  return (
    <div className="flex flex-col gap-6">
      {statusCounts && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="待审核" value={statusCounts.pending} icon={Clock} tone="warning" />
          <StatTile label="已通过" value={statusCounts.approved} icon={CheckCircle2} tone="success" />
          <StatTile label="已驳回" value={statusCounts.rejected} icon={XCircle} tone="default" />
        </div>
      )}

      <Card>
      <CardHeader>
        <CardTitle>Billing Requests</CardTitle>
        <CardDescription>对公结算申请：人工审核企业客户提交的结算信息，通过/驳回后走线下签约与对接。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="按公司 / 联系人 / 邮箱 / 工作区搜索…"
          className="max-w-sm"
        />
        <div className="flex gap-1">
          {(["pending", "approved", "rejected", "all"] as const).map((value) => (
            <Button
              key={value}
              variant={statusFilter === value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setOffset(0);
                setStatusFilter(value);
              }}
            >
              {value === "all" ? "全部" : statusLabels[value]}
            </Button>
          ))}
        </div>
      </div>

      {loading && requests.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ink-500">
          <Loader2 className="size-4 animate-spin" /> 加载中…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : requests.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">没有匹配的申请。</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>工作区</TableHead>
                <TableHead>公司</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>预估月消耗</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium text-ink-950">{request.organizationName}</TableCell>
                  <TableCell>
                    <div>{request.companyName}</div>
                    {request.taxId ? <div className="text-xs text-ink-500">{request.taxId}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div>{request.contactName}</div>
                    <div className="text-xs text-ink-500">
                      {request.contactEmail}
                      {request.contactPhone ? ` · ${request.contactPhone}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>{request.estimatedMonthlySpendCredits ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariants[request.status]}>{statusLabels[request.status]}</Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                  <TableCell>
                    {request.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openAction("approved", request)}>
                          通过
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openAction("rejected", request)}>
                          驳回
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-500">{request.reviewNotes || "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-ink-600">
            <span>
              显示第 {rangeStart}–{rangeEnd} 条，共 {total} 条
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                上一页
              </Button>
              <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
      </CardContent>
      </Card>

      <Dialog open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.kind === "approved" ? "通过申请" : "驳回申请"}</DialogTitle>
            <DialogDescription>
              {pending
                ? pending.kind === "approved"
                  ? `确定通过 ${pending.request.companyName}（${pending.request.organizationName}）的对公结算申请吗？通过后请线下跟进签约与对接。`
                  : `确定驳回 ${pending.request.companyName}（${pending.request.organizationName}）的对公结算申请吗？建议填写驳回原因，申请人可见。`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <label className="block text-sm font-medium text-ink-800">
            审核备注（可选，申请人可见）
            <textarea
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              maxLength={4000}
              rows={3}
              className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500"
            />
          </label>

          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              取消
            </Button>
            <Button
              variant={pending?.kind === "rejected" ? "destructive" : "default"}
              onClick={() => void confirmPending()}
              disabled={saving}
            >
              {saving ? "处理中…" : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
