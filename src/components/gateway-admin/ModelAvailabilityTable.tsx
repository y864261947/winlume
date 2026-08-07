"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListChecks, Loader2, ToggleRight, ToggleLeft } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ModelAvailabilityRow {
  id: string;
  catalog_version_id: string;
  model: string;
  billing_group: string;
  provider_type: number;
  protocol_family: string;
  enabled: boolean;
  priority: number;
  weight: number;
  updated_at: string;
}

type FormState = {
  priority: string;
  weight: string;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function ModelAvailabilityTable() {
  const [rows, setRows] = useState<ModelAvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ModelAvailabilityRow | null>(null);
  const [form, setForm] = useState<FormState>({ priority: "0", weight: "0" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gateway-admin/model-availability", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? body.error ?? "加载失败");
      setRows(body.model_availability ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = useCallback((row: ModelAvailabilityRow) => {
    setEditing(row);
    setForm({ priority: String(row.priority), weight: String(row.weight) });
    setFormError(null);
  }, []);

  const closeDialog = useCallback(() => {
    setEditing(null);
  }, []);

  const patch = useCallback(
    async (row: ModelAvailabilityRow, body: Record<string, unknown>) => {
      const response = await fetch(`/api/gateway-admin/model-availability/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseBody.error?.message ?? responseBody.error ?? "更新失败");
      }
      return responseBody;
    },
    [],
  );

  const save = useCallback(async () => {
    if (!editing) return;
    setFormError(null);
    const priority = Number(form.priority);
    const weight = Number(form.weight);
    if (!Number.isFinite(priority) || priority < 0 || !Number.isFinite(weight) || weight < 0) {
      setFormError("优先级和权重必须是非负数字。");
      return;
    }
    setSaving(true);
    try {
      await patch(editing, { priority, weight });
      closeDialog();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [editing, form, patch, closeDialog, load]);

  const toggleEnabled = useCallback(
    async (row: ModelAvailabilityRow) => {
      try {
        await patch(row, { enabled: !row.enabled });
        await load();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "更新失败");
      }
    },
    [patch, load],
  );

  const stats = useMemo(() => {
    const enabled = rows.filter((row) => row.enabled).length;
    return { total: rows.length, enabled, disabled: rows.length - enabled };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="模型条目总数" value={stats.total} icon={ListChecks} tone="primary" />
          <StatTile label="已启用" value={stats.enabled} icon={ToggleRight} tone="success" />
          <StatTile
            label="已停用"
            value={stats.disabled}
            icon={ToggleLeft}
            tone={stats.disabled > 0 ? "warning" : "default"}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Model Availability</CardTitle>
            <CardDescription>当前生效定价目录下每个模型 · 计费分组 · 上游组合的可用性、优先级与权重。</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ink-500">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">当前生效定价目录下还没有模型可用性数据。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型</TableHead>
                  <TableHead>计费分组</TableHead>
                  <TableHead>上游类型</TableHead>
                  <TableHead>协议族</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>权重</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-ink-950">{row.model}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.billing_group}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-700">{row.provider_type}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.protocol_family}</Badge>
                    </TableCell>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell>{row.weight}</TableCell>
                    <TableCell>
                      <Badge variant={row.enabled ? "success" : "outline"}>{row.enabled ? "启用" : "停用"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-ink-500">{formatDateTime(row.updated_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void toggleEnabled(row)}>
                          {row.enabled ? "停用" : "启用"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing != null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑模型可用性</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.model} · ${editing.billing_group} · ${editing.protocol_family}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="model-availability-priority">优先级</Label>
              <Input
                id="model-availability-priority"
                type="number"
                min={0}
                value={form.priority}
                onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="model-availability-weight">权重</Label>
              <Input
                id="model-availability-weight"
                type="number"
                min={0}
                value={form.weight}
                onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))}
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
