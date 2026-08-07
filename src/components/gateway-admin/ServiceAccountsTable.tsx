"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Infinity as InfinityIcon, KeyRound, Loader2, Wallet } from "lucide-react";

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
  const [searchInput, setSearchInput] = useState("");

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

  const stats = useMemo(() => {
    const unlimitedCount = accounts.filter((a) => a.unlimited).length;
    const totalSpent = accounts.reduce((sum, a) => sum + a.total_spent_microcredits, 0);
    return { total: accounts.length, unlimitedCount, totalSpent };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      [account.display_name, account.username, account.key_prefix].some((field) =>
        field.toLowerCase().includes(query),
      ),
    );
  }, [accounts, searchInput]);

  return (
    <div className="flex flex-col gap-6">
      {!loading && !error && accounts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Service Accounts 总数" value={stats.total} icon={KeyRound} tone="primary" />
          <StatTile label="无限制账户" value={stats.unlimitedCount} icon={InfinityIcon} tone="success" />
          <StatTile
            label="累计消耗"
            value={stats.totalSpent}
            hint="microcredits"
            icon={Wallet}
            tone="warning"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Service Accounts</CardTitle>
          <CardDescription>内部应用的 API key、计费组与配额管理。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!loading && !error && accounts.length > 0 && (
            <div className="flex items-center gap-2">
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="按应用名 / 用户名 / key 前缀搜索…"
                className="max-w-sm"
              />
            </div>
          )}

          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ink-500">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              还没有 service account。用 create-service-account 命令创建一个。
            </p>
          ) : filteredAccounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">没有匹配的 service account。</p>
          ) : (
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
                {filteredAccounts.map((account) => (
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
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
