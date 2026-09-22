"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useModals } from "@/components/providers";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ModelPricingDialog from "./ModelPricingDialog";
import { PRICE_REFERENCES, REFERENCE_CHECKED_AT, type PriceDraft } from "@/lib/service-pricing/catalog";

async function request(url: string, body?: unknown) {
  const response = await fetch(url, { cache: "no-store", ...(body ? { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "读取失败，请稍后重试。");
  return data;
}
function PriceEditor({ price, onSaved }: { price: PriceDraft; onSaved: (price: PriceDraft) => void }) {
  const ref = PRICE_REFERENCES.find(row => row.id === price.id)!;
  const [cost, setCost] = useState(price.cost ?? "");
  const [sale, setSale] = useState(price.sale ?? "");
  const [costCurrency, setCostCurrency] = useState(price.costCurrency);
  const [saleCurrency, setSaleCurrency] = useState(price.saleCurrency);
  const [notes, setNotes] = useState(price.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = cost !== (price.cost ?? "") || sale !== (price.sale ?? "") || costCurrency !== price.costCurrency || saleCurrency !== price.saleCurrency || notes !== price.notes;
  const margin = cost !== "" && sale !== "" && Number(sale) > 0 && costCurrency === saleCurrency ? ((Number(sale) - Number(cost)) / Number(sale) * 100) : null;
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request("/api/admin/service-pricing", { id: price.id, config: { revision: price.revision, cost: cost.trim() || null, sale: sale.trim() || null, costCurrency, saleCurrency, notes } });
      onSaved(data.price); setCost(data.price.cost ?? ""); setSale(data.price.sale ?? ""); setNotes(data.price.notes);
      setNotice("已保存；尚未应用到用户扣费。");
    } catch(e) { setError(e instanceof Error ? e.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  return <article className="rounded-xl border border-border bg-card p-5" aria-label={ref.model}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{ref.provider} <span className="ml-2 text-xs font-normal text-muted-foreground">{ref.route}</span></h2><p className="mt-1 break-all text-sm">{ref.model}</p></div><span className="rounded-md bg-muted px-2 py-1 text-xs">{price.sale === null ? "未定价" : "已保存拟定价格"} · 未开放扣费</span></div>
    <div className="my-4 rounded-lg bg-muted/40 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>官方参考：{ref.usd === null ? "待确认" : `$${ref.usd} / ${ref.unit}`}</strong><a className="text-primary underline" href={ref.source} target="_blank" rel="noreferrer">官方来源 ↗</a></div><p className="mt-2 leading-6 text-muted-foreground">{ref.note}</p><p className="mt-1 text-xs text-muted-foreground">核对日期 {REFERENCE_CHECKED_AT} · 美元参考价，不自动更新</p></div>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm">成本价 / {ref.unit}<div className="flex gap-2"><select aria-label="成本币种" className="rounded-md border px-2" value={costCurrency} onChange={e => setCostCurrency(e.target.value as "USD" | "CNY")}><option>USD</option><option>CNY</option></select><Input aria-label="成本价" inputMode="decimal" placeholder="未填写" value={cost} onChange={e => { setCost(e.target.value); setNotice(""); }} /></div></label>
      <label className="grid gap-2 text-sm">拟定销售价 / {ref.unit}<div className="flex gap-2"><select aria-label="销售币种" className="rounded-md border px-2" value={saleCurrency} onChange={e => setSaleCurrency(e.target.value as "USD" | "CNY")}><option>USD</option><option>CNY</option></select><Input aria-label="拟定销售价" inputMode="decimal" placeholder="留空表示未定价" value={sale} onChange={e => { setSale(e.target.value); setNotice(""); }} /></div></label>
      <label className="grid gap-2 text-sm sm:col-span-2">备注<Input aria-label="定价备注" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="套餐、折扣或价格依据" /></label>
    </fieldset>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button disabled={busy || !dirty} onClick={() => void save()}>{busy ? "保存中…" : "保存价格"}</Button>{ref.usd !== null && <Button variant="outline" disabled={busy} onClick={() => { setCost(ref.usd!); setCostCurrency("USD"); setNotice(""); }}>参考价填入成本</Button>}<span className="text-xs text-muted-foreground">{margin !== null && Number.isFinite(margin) ? `估算毛利率 ${margin.toFixed(1)}%（不含税费及其他成本）` : costCurrency !== saleCurrency ? "币种不同，暂不估算毛利" : "最多 6 位小数，0 表示零价"}</span></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
  </article>;
}
type Vendor = { id: string; name: string; models: { name: string }[] };
export default function ServicePricingContent() {
  const { account, accountLoading } = useModals();
  const [prices, setPrices] = useState<PriceDraft[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [error, setError] = useState("");
  const [relayError, setRelayError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState("services");
  const [editing, setEditing] = useState<Vendor | null>(null);
  useEffect(() => {
    if (account?.platform_role !== "admin") return;
    let cancelled = false;
    request("/api/admin/service-pricing").then(data => { if (!cancelled) { setPrices(data.prices); setError(""); } }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    request("/api/admin/portal-content").then(data => { if (!cancelled) { setVendors(data.modelVendors); setRelayError(""); } }).catch(e => { if (!cancelled) setRelayError(e.message); });
    return () => { cancelled = true; };
  }, [account?.platform_role, reload]);
  if (accountLoading) return <ConsolePage title="模型与服务定价"><p>正在加载…</p></ConsolePage>;
  if (account?.platform_role !== "admin") return <ConsolePage title="模型与服务定价"><ConsoleEmptyState title="仅平台管理员可访问" description="请使用管理员账号登录。" /></ConsolePage>;
  return <ConsolePage title="模型与服务定价" description="核对供应商成本，维护销售价格。" actions={<Link href="/account/services" className="text-sm text-primary">服务接入 →</Link>}>
    <div className="mb-5 flex flex-wrap gap-2"><Button variant={tab === "services" ? "default" : "outline"} onClick={() => setTab("services")}>新增服务价格</Button><Button variant={tab === "relay" ? "default" : "outline"} onClick={() => setTab("relay")}>New API 正式费率</Button></div>
    {tab === "services" ? <><p className="mb-5 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6">这里保存新增服务的成本与拟定销售价，供定价准备使用。保存不会启用渠道、修改 New API 费率或开始扣费。正式调用与计费接通前，门户继续显示“展示预览”。</p>{error ? <p role="alert">{error} <Button variant="outline" onClick={() => setReload(n => n + 1)}>重试</Button></p> : loading ? <p>正在读取价格…</p> : <div className="grid gap-5 xl:grid-cols-2">{prices.map(price => <PriceEditor key={`${price.id}-${reload}`} price={price} onSaved={next => setPrices(rows => rows.map(row => row.id === next.id ? next : row))} />)}</div>}</> : <><p className="mb-5 text-sm text-muted-foreground">此处修改已进入 New API 计费目录的正式费率，保存后会影响实际扣费。尚未接入计费目录的服务请先在“新增服务价格”中拟定。</p>{relayError && <p role="alert">{relayError}</p>}<div className="grid gap-3 sm:grid-cols-2">{vendors.map(vendor => <div key={vendor.id} className="flex items-center justify-between gap-3 rounded-lg border p-4"><span>{vendor.name}<small className="ml-2 text-muted-foreground">{vendor.models.length} 个模型</small></span><Button variant="outline" onClick={() => setEditing(vendor)}>模型定价</Button></div>)}</div></>}
    {editing && <ModelPricingDialog vendor={editing} onClose={() => setEditing(null)} />}
  </ConsolePage>;
}
