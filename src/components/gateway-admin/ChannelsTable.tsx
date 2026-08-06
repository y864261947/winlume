"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, ToggleRight, Waypoints } from "lucide-react";

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

const PROTOCOL_FAMILIES = [
  "openai",
  "claude",
  "gemini",
  "images",
  "audio",
  "embeddings",
  "realtime",
  "task",
  "midjourney",
  "suno",
  "video",
];

interface Channel {
  id: string;
  name: string;
  protocol_family: string;
  base_url: string;
  has_api_key: boolean;
  enabled: boolean;
  priority: number;
  weight: number;
  created_at: string;
  updated_at: string;
}

type FormState = {
  name: string;
  protocolFamily: string;
  baseUrl: string;
  apiKey: string;
  priority: string;
  weight: string;
};

const emptyForm: FormState = {
  name: "",
  protocolFamily: PROTOCOL_FAMILIES[0],
  baseUrl: "",
  apiKey: "",
  priority: "0",
  weight: "0",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function ChannelsTable() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Channel | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gateway-admin/channels", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? body.error ?? "加载失败");
      setChannels(body.channels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setCreating(true);
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
  }, []);

  const openEdit = useCallback((channel: Channel) => {
    setEditing(channel);
    setCreating(false);
    setForm({
      name: channel.name,
      protocolFamily: channel.protocol_family,
      baseUrl: channel.base_url,
      apiKey: "",
      priority: String(channel.priority),
      weight: String(channel.weight),
    });
    setFormError(null);
  }, []);

  const closeDialog = useCallback(() => {
    setEditing(null);
    setCreating(false);
  }, []);

  const save = useCallback(async () => {
    setFormError(null);
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim();
    const priority = Number(form.priority);
    const weight = Number(form.weight);
    if (!name || !baseUrl) {
      setFormError("名称和上游地址不能为空。");
      return;
    }
    if (creating && !form.apiKey.trim()) {
      setFormError("新建渠道必须填写 API Key。");
      return;
    }
    if (!Number.isFinite(priority) || priority < 0 || !Number.isFinite(weight) || weight < 0) {
      setFormError("优先级和权重必须是非负数字。");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        protocol_family: form.protocolFamily,
        base_url: baseUrl,
        priority,
        weight,
      };
      if (creating || form.apiKey.trim()) {
        payload.api_key = form.apiKey.trim();
      }

      const url = creating ? "/api/gateway-admin/channels" : `/api/gateway-admin/channels/${editing!.id}`;
      const response = await fetch(url, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(body.error?.message ?? body.error ?? "保存失败");
        return;
      }
      closeDialog();
      await load();
    } finally {
      setSaving(false);
    }
  }, [form, creating, editing, closeDialog, load]);

  const toggleEnabled = useCallback(
    async (channel: Channel) => {
      const response = await fetch(`/api/gateway-admin/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !channel.enabled }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        window.alert(body.error?.message ?? body.error ?? "更新失败");
        return;
      }
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (channel: Channel) => {
      if (!window.confirm(`确定要删除渠道 "${channel.name}" 吗？此操作不可撤销。`)) return;
      const response = await fetch(`/api/gateway-admin/channels/${channel.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        window.alert(body.error?.message ?? body.error ?? "删除失败");
        return;
      }
      await load();
    },
    [load],
  );

  const dialogOpen = creating || editing != null;

  const stats = useMemo(() => {
    const enabled = channels.filter((c) => c.enabled).length;
    const missingKey = channels.filter((c) => !c.has_api_key).length;
    return { total: channels.length, enabled, missingKey };
  }, [channels]);

  return (
    <div className="flex flex-col gap-6">
      {!loading && !error && channels.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="渠道总数" value={stats.total} icon={Waypoints} tone="primary" />
          <StatTile label="已启用" value={stats.enabled} icon={ToggleRight} tone="success" />
          <StatTile
            label="缺少 API Key"
            value={stats.missingKey}
            icon={AlertTriangle}
            tone={stats.missingKey > 0 ? "warning" : "default"}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Channels</CardTitle>
              <CardDescription>上游渠道连接配置（地址、密钥、优先级/权重）。</CardDescription>
            </div>
            <Button onClick={openCreate} disabled={loading || !!error}>
              新建渠道
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ink-500">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : channels.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">还没有配置渠道。</p>
          ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>协议族</TableHead>
              <TableHead>上游地址</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>权重</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="font-medium text-ink-950">{channel.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{channel.protocol_family}</Badge>
                </TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs text-ink-700">{channel.base_url}</TableCell>
                <TableCell>{channel.has_api_key ? <Badge variant="secondary">已配置</Badge> : <Badge variant="destructive">未配置</Badge>}</TableCell>
                <TableCell>{channel.priority}</TableCell>
                <TableCell>{channel.weight}</TableCell>
                <TableCell>
                  <Badge variant={channel.enabled ? "success" : "outline"}>{channel.enabled ? "启用" : "停用"}</Badge>
                </TableCell>
                <TableCell className="text-xs text-ink-500">{formatDateTime(channel.updated_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(channel)}>
                      编辑
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void toggleEnabled(channel)}>
                      {channel.enabled ? "停用" : "启用"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void remove(channel)}>
                      删除
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

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? "新建渠道" : "编辑渠道"}</DialogTitle>
            <DialogDescription>{creating ? "填写渠道连接信息。" : editing?.name}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="channel-name">名称</Label>
              <Input id="channel-name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="channel-protocol">协议族</Label>
              <select
                id="channel-protocol"
                value={form.protocolFamily}
                onChange={(event) => setForm((prev) => ({ ...prev, protocolFamily: event.target.value }))}
                className="h-9 rounded-md border border-line bg-surface px-3 text-sm text-ink-950"
              >
                {PROTOCOL_FAMILIES.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="channel-base-url">上游地址</Label>
              <Input
                id="channel-base-url"
                value={form.baseUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                placeholder="https://api.example.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="channel-api-key">API Key{creating ? "" : "（留空表示不修改）"}</Label>
              <Input
                id="channel-api-key"
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="channel-priority">优先级</Label>
                <Input
                  id="channel-priority"
                  type="number"
                  min={0}
                  value={form.priority}
                  onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="channel-weight">权重</Label>
                <Input
                  id="channel-weight"
                  type="number"
                  min={0}
                  value={form.weight}
                  onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))}
                />
              </div>
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
