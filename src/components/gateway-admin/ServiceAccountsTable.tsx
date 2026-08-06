"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ServiceAccount {
  user_id: string;
  username: string;
  display_name: string;
  user_status: string;
  api_key_id: string;
  key_prefix: string;
  api_key_status: string;
  billing_group: string;
  unlimited: boolean;
  quota_limit: number | null;
  last_used_at: string | null;
  created_at: string;
  total_spent_microcredits: number;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

export default function ServiceAccountsTable() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ServiceAccount | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [unlimitedInput, setUnlimitedInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gateway-admin/service-accounts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "加载失败");
      setAccounts(body.service_accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = useCallback((account: ServiceAccount) => {
    setEditing(account);
    setUnlimitedInput(account.unlimited);
    setQuotaInput(account.quota_limit != null ? String(account.quota_limit) : "");
    setFormError(null);
  }, []);

  const saveQuota = useCallback(async () => {
    if (!editing) return;
    setFormError(null);

    let quotaLimit: number | null = null;
    if (!unlimitedInput) {
      const trimmed = quotaInput.trim();
      quotaLimit = Number(trimmed);
      if (trimmed === "" || !Number.isFinite(quotaLimit) || quotaLimit < 0) {
        setFormError("配额上限必须是非负数字。");
        return;
      }
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/gateway-admin/service-accounts/${editing.api_key_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billing_group: editing.billing_group,
          unlimited: unlimitedInput,
          quota_limit: quotaLimit,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(body.error ?? "更新失败");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }, [editing, unlimitedInput, quotaInput, load]);

  const revoke = useCallback(
    async (account: ServiceAccount) => {
      if (!window.confirm(`确定要吊销 ${account.display_name} 的 key 吗？此操作不可撤销。`)) return;
      const response = await fetch(`/api/gateway-admin/service-accounts/${account.api_key_id}/revoke`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        window.alert(body.error ?? "吊销失败");
        return;
      }
      await load();
    },
    [load],
  );

  if (loading) return <p className="text-sm text-ink-600">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (accounts.length === 0) {
    return <p className="text-sm text-ink-600">还没有 service account。用 create-service-account 命令创建一个。</p>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>应用</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>计费组</TableHead>
            <TableHead>配额</TableHead>
            <TableHead>已用</TableHead>
            <TableHead>最近使用</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.api_key_id}>
              <TableCell>
                <div className="font-medium text-ink-950">{account.display_name}</div>
                <div className="text-xs text-ink-500">{account.username}</div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-ink-700">{account.key_prefix}…</span>
              </TableCell>
              <TableCell>{account.billing_group}</TableCell>
              <TableCell>
                {account.unlimited ? (
                  <Badge variant="success">无限制</Badge>
                ) : (
                  <span>{account.quota_limit ?? 0}</span>
                )}
              </TableCell>
              <TableCell>{account.total_spent_microcredits}</TableCell>
              <TableCell>{formatDateTime(account.last_used_at)}</TableCell>
              <TableCell>
                <Badge variant={account.api_key_status === "revoked" ? "destructive" : "outline"}>
                  {account.api_key_status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(account)}>
                    改配额
                  </Button>
                  {account.api_key_status !== "revoked" && (
                    <Button variant="destructive" size="sm" onClick={() => void revoke(account)}>
                      吊销
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置配额</DialogTitle>
            <DialogDescription>{editing?.display_name}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <input
              id="unlimited"
              type="checkbox"
              checked={unlimitedInput}
              onChange={(event) => setUnlimitedInput(event.target.checked)}
              className="size-4 rounded border-line"
            />
            <Label htmlFor="unlimited">无限制</Label>
          </div>

          {!unlimitedInput && (
            <div className="grid gap-1.5">
              <Label htmlFor="quota-limit">配额上限（microcredits）</Label>
              <Input
                id="quota-limit"
                type="number"
                min={0}
                value={quotaInput}
                onChange={(event) => setQuotaInput(event.target.value)}
              />
            </div>
          )}

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={() => void saveQuota()} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
