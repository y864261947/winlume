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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PlatformUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: "active" | "suspended" | "pending";
  platformRole: "user" | "admin";
  lastLoginAt: string | null;
  createdAt: string;
}

type PendingAction =
  | { kind: "status"; user: PlatformUser; nextStatus: "active" | "suspended" }
  | { kind: "role"; user: PlatformUser; nextRole: "user" | "admin" };

const PAGE_SIZE = 50;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

export default function UsersTable() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (currentSearch: string, currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (currentSearch) params.set("search", currentSearch);
      const response = await fetch(`/api/gateway-admin/users?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "加载失败");
      setUsers(body.users ?? []);
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
    void load(search, offset);
  }, [load, search, offset]);

  const openStatusConfirm = useCallback((user: PlatformUser) => {
    setActionError(null);
    setPending({
      kind: "status",
      user,
      nextStatus: user.status === "active" ? "suspended" : "active",
    });
  }, []);

  const openRoleConfirm = useCallback((user: PlatformUser) => {
    setActionError(null);
    setPending({
      kind: "role",
      user,
      nextRole: user.platformRole === "admin" ? "user" : "admin",
    });
  }, []);

  const confirmPending = useCallback(async () => {
    if (!pending) return;
    setActionError(null);
    setSaving(true);
    try {
      const body =
        pending.kind === "status" ? { status: pending.nextStatus } : { platformRole: pending.nextRole };
      const response = await fetch(`/api/gateway-admin/users/${pending.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(responseBody.error ?? "更新失败");
        return;
      }
      setPending(null);
      await load(search, offset);
    } finally {
      setSaving(false);
    }
  }, [pending, load, search, offset]);

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + users.length, total);
  const canPrev = offset > 0;
  const canNext = offset + users.length < total;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="按用户名 / 邮箱 / 显示名搜索…"
          className="max-w-sm"
        />
      </div>

      {loading && users.length === 0 ? (
        <p className="text-sm text-ink-600">加载中…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-ink-600">没有匹配的用户。</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>显示名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>最近登录</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium text-ink-950">{user.username}</TableCell>
                  <TableCell>{user.email ?? "—"}</TableCell>
                  <TableCell>{user.displayName}</TableCell>
                  <TableCell>
                    <Badge variant={user.status === "suspended" ? "destructive" : "success"}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.platformRole === "admin" ? "default" : "outline"}>
                      {user.platformRole}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openStatusConfirm(user)}>
                        {user.status === "active" ? "封禁" : "恢复"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openRoleConfirm(user)}>
                        {user.platformRole === "admin" ? "取消管理员" : "设为管理员"}
                      </Button>
                    </div>
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

      <Dialog open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "status"
                ? pending.nextStatus === "suspended"
                  ? "封禁用户"
                  : "恢复用户"
                : pending?.kind === "role"
                  ? pending.nextRole === "admin"
                    ? "设为管理员"
                    : "取消管理员权限"
                  : ""}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "status" &&
                (pending.nextStatus === "suspended"
                  ? `确定要封禁 ${pending.user.displayName}（${pending.user.username}）吗？封禁后该用户将无法登录。`
                  : `确定要恢复 ${pending.user.displayName}（${pending.user.username}）的账号吗？`)}
              {pending?.kind === "role" &&
                (pending.nextRole === "admin"
                  ? `确定要将 ${pending.user.displayName}（${pending.user.username}）设为平台管理员吗？管理员可以访问网关管理后台的所有功能。`
                  : `确定要取消 ${pending.user.displayName}（${pending.user.username}）的管理员权限吗？`)}
            </DialogDescription>
          </DialogHeader>

          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              取消
            </Button>
            <Button
              variant={
                pending?.kind === "status" && pending.nextStatus === "suspended" ? "destructive" : "default"
              }
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
