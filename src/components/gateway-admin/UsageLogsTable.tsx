"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface UsageLogEvent {
  id: string;
  occurredAt: string;
  userId: string;
  username: string | null;
  userEmail: string | null;
  organizationId: string | null;
  apiKeyId: string | null;
  provider: string;
  model: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicrocredits: number;
  requestId: string | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "reserved", label: "reserved" },
  { value: "settlement_pending", label: "settlement_pending" },
  { value: "settled", label: "settled" },
  { value: "reversed", label: "reversed" },
  { value: "failed", label: "failed" },
];

const PAGE_SIZE = 50;

function statusVariant(status: string): "success" | "destructive" | "outline" | "secondary" {
  if (status === "settled") return "success";
  if (status === "failed" || status === "reversed") return "destructive";
  if (status === "reserved" || status === "settlement_pending") return "secondary";
  return "outline";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

/** Formats a JS Date as the `YYYY-MM-DDThh:mm` string that <input type="datetime-local"> expects/produces. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function UsageLogsTable() {
  const [events, setEvents] = useState<UsageLogEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const defaultUntil = useMemo(() => new Date(), []);
  const defaultSince = useMemo(() => new Date(defaultUntil.getTime() - 24 * 60 * 60 * 1000), [defaultUntil]);

  const [sinceInput, setSinceInput] = useState(toLocalInputValue(defaultSince));
  const [untilInput, setUntilInput] = useState(toLocalInputValue(defaultUntil));
  const [statusInput, setStatusInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (sinceInput) query.set("since", new Date(sinceInput).toISOString());
      if (untilInput) query.set("until", new Date(untilInput).toISOString());
      if (statusInput) query.set("status", statusInput);
      if (modelInput.trim()) query.set("model", modelInput.trim());
      if (searchInput.trim()) query.set("search", searchInput.trim());
      query.set("limit", String(PAGE_SIZE));
      query.set("offset", String(offset));

      const response = await fetch(`/api/gateway-admin/logs?${query.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "加载失败");
      setEvents(body.events ?? []);
      setTotal(body.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [sinceInput, untilInput, statusInput, modelInput, searchInput, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = useCallback(() => {
    setOffset(0);
    void load();
  }, [load]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface p-4">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-ink-600" htmlFor="logs-since">
            起始时间
          </label>
          <Input
            id="logs-since"
            type="datetime-local"
            value={sinceInput}
            onChange={(event) => setSinceInput(event.target.value)}
            className="w-48"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-ink-600" htmlFor="logs-until">
            结束时间
          </label>
          <Input
            id="logs-until"
            type="datetime-local"
            value={untilInput}
            onChange={(event) => setUntilInput(event.target.value)}
            className="w-48"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-ink-600" htmlFor="logs-status">
            状态
          </label>
          <select
            id="logs-status"
            value={statusInput}
            onChange={(event) => setStatusInput(event.target.value)}
            className="flex h-9 w-40 rounded-md border border-line bg-surface px-3 py-1 text-sm text-ink-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-ink-600" htmlFor="logs-model">
            模型
          </label>
          <Input
            id="logs-model"
            placeholder="模型名称包含…"
            value={modelInput}
            onChange={(event) => setModelInput(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-ink-600" htmlFor="logs-search">
            用户搜索
          </label>
          <Input
            id="logs-search"
            placeholder="用户名 / 邮箱"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="w-48"
          />
        </div>
        <Button onClick={applyFilters} disabled={loading}>
          筛选
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink-600">加载中…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-ink-600">没有符合条件的用量记录。</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>Tokens (输入/输出/合计)</TableHead>
              <TableHead>费用 (microcredits)</TableHead>
              <TableHead>Request ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="whitespace-nowrap text-xs text-ink-700">
                  {formatDateTime(event.occurredAt)}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-ink-950">{event.username ?? "—"}</div>
                  <div className="text-xs text-ink-500">{event.userEmail ?? event.userId}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{event.model}</TableCell>
                <TableCell className="text-xs text-ink-700">{event.provider}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {event.inputTokens} / {event.outputTokens} / {event.totalTokens}
                </TableCell>
                <TableCell>{event.costMicrocredits}</TableCell>
                <TableCell className="max-w-[180px] truncate font-mono text-xs text-ink-500" title={event.requestId ?? undefined}>
                  {event.requestId ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-between text-sm text-ink-600">
        <span>
          共 {total} 条 · 第 {page} / {pageCount} 页
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
