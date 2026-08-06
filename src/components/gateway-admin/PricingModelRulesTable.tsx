"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ModelRule {
  model_key: string;
  mode: string;
  model_ratio: string;
  completion_ratio: string;
  cache_read_ratio: string;
  cache_write_ratio: string;
  cache_write_one_hour_ratio: string;
  image_ratio: string;
  audio_input_ratio: string;
  audio_completion_ratio: string;
  enabled_groups: string[];
  protocol_families: string[];
}

type NumericField = Exclude<keyof ModelRule, "model_key" | "mode" | "enabled_groups" | "protocol_families">;

const NUMERIC_FIELDS: { key: NumericField; label: string }[] = [
  { key: "model_ratio", label: "模型倍率" },
  { key: "completion_ratio", label: "补全倍率" },
  { key: "cache_read_ratio", label: "缓存读倍率" },
  { key: "cache_write_ratio", label: "缓存写倍率" },
  { key: "cache_write_one_hour_ratio", label: "缓存写1h倍率" },
  { key: "image_ratio", label: "图像倍率" },
  { key: "audio_input_ratio", label: "音频输入倍率" },
  { key: "audio_completion_ratio", label: "音频补全倍率" },
];

function emptyRule(): ModelRule {
  return {
    model_key: "",
    mode: "ratio",
    model_ratio: "1",
    completion_ratio: "1",
    cache_read_ratio: "1",
    cache_write_ratio: "1",
    cache_write_one_hour_ratio: "1",
    image_ratio: "1",
    audio_input_ratio: "1",
    audio_completion_ratio: "1",
    enabled_groups: [],
    protocol_families: [],
  };
}

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export default function PricingModelRulesTable() {
  const [rows, setRows] = useState<ModelRule[]>([]);
  const [saved, setSaved] = useState<ModelRule[]>([]);
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
      const rules: ModelRule[] = body.model_rules ?? [];
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

  const updateRow = useCallback((index: number, patch: Partial<ModelRule>) => {
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
      const response = await fetch("/api/gateway-admin/pricing/model-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_rules: rows }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(body.error ?? "保存失败");
        return;
      }
      const rules: ModelRule[] = body.model_rules ?? rows;
      setRows(rules);
      setSaved(rules);
    } finally {
      setSaving(false);
    }
  }, [rows]);

  if (loading) return <p className="text-sm text-ink-600">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-950">模型倍率</h2>
          {dirty && <Badge variant="outline">未保存</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            添加行
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <p className="mb-2 text-xs text-ink-500">当前仅支持 mode = ratio 的模型规则编辑。</p>

      {saveError && <p className="mb-2 text-sm text-red-600">{saveError}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-ink-600">还没有模型倍率规则。</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型</TableHead>
              {NUMERIC_FIELDS.map((field) => (
                <TableHead key={field.key}>{field.label}</TableHead>
              ))}
              <TableHead>可用分组</TableHead>
              <TableHead>协议族</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Input
                    value={row.model_key}
                    onChange={(event) => updateRow(index, { model_key: event.target.value })}
                    className="h-8 w-32"
                  />
                </TableCell>
                {NUMERIC_FIELDS.map((field) => (
                  <TableCell key={field.key}>
                    <Input
                      value={row[field.key]}
                      onChange={(event) => updateRow(index, { [field.key]: event.target.value } as Partial<ModelRule>)}
                      className="h-8 w-20"
                      inputMode="decimal"
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Input
                    value={toCsv(row.enabled_groups)}
                    onChange={(event) => updateRow(index, { enabled_groups: fromCsv(event.target.value) })}
                    className="h-8 w-36"
                    placeholder="default, vip"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={toCsv(row.protocol_families)}
                    onChange={(event) => updateRow(index, { protocol_families: fromCsv(event.target.value) })}
                    className="h-8 w-36"
                    placeholder="openai, anthropic"
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
    </div>
  );
}
