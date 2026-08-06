"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface GroupRule {
  user_group: string;
  billing_group: string;
  group_ratio: string;
}

function emptyRule(): GroupRule {
  return { user_group: "", billing_group: "", group_ratio: "1" };
}

export default function PricingGroupRulesTable() {
  const [rows, setRows] = useState<GroupRule[]>([]);
  const [saved, setSaved] = useState<GroupRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gateway-admin/pricing", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "加载失败");
      const rules: GroupRule[] = body.group_rules ?? [];
      setRows(rules);
      setSaved(rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);

  const updateRow = useCallback((index: number, patch: Partial<GroupRule>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRule()]);
  }, []);

  const save = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/gateway-admin/pricing/group-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_rules: rows }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(body.error ?? "保存失败");
        return;
      }
      const rules: GroupRule[] = body.group_rules ?? rows;
      setRows(rules);
      setSaved(rules);
    } finally {
      setSaving(false);
    }
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              分组倍率
              {dirty && <Badge variant="outline">未保存</Badge>}
            </CardTitle>
            <CardDescription>
              {loading || error ? "按用户组配置计费组与倍率。" : `共 ${rows.length} 条分组规则`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addRow} disabled={loading || !!error}>
              添加行
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {saveError && <p className="mb-2 text-sm text-red-600">{saveError}</p>}

        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ink-500">
            <Loader2 className="size-4 animate-spin" /> 加载中…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">还没有分组倍率规则。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户组</TableHead>
                <TableHead>计费组</TableHead>
                <TableHead>倍率</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input
                      value={row.user_group}
                      onChange={(event) => updateRow(index, { user_group: event.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.billing_group}
                      onChange={(event) => updateRow(index, { billing_group: event.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.group_ratio}
                      onChange={(event) => updateRow(index, { group_ratio: event.target.value })}
                      className="h-8 w-24"
                      inputMode="decimal"
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm" onClick={() => removeRow(index)}>
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
