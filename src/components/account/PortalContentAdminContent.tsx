"use client";

import { ImagePlus, LoaderCircle, Megaphone, Plus, Save, Trash2, Upload, WandSparkles } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { useModals } from "@/components/providers";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";

type Category = "llm" | "image" | "audio" | "video" | "embed" | "other";
type Slide = { id: string; imageUrl: string; alt: string; href: string; enabled: boolean };
type Notice = { id: string; title: string; body: string; href: string; enabled: boolean; createdAt: string };
type Vendor = { id: string; name: string; key: string; logoUrl: string; category: Category; enabled: boolean; models: Array<{ name: string; endpointTypes: string[]; description?: string }> };
type PortalContent = { carousel: Slide[]; notifications: Notice[]; modelVendors: Vendor[] };

const categories: Array<{ value: Category; label: string }> = [
  { value: "llm", label: "语言推理" }, { value: "image", label: "图像处理" }, { value: "audio", label: "音频处理" }, { value: "video", label: "视频处理" }, { value: "embed", label: "RAG 知识库" }, { value: "other", label: "信息检索" },
];

const emptyContent: PortalContent = { carousel: [], notifications: [], modelVendors: [] };
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

function modelsToText(models: Vendor["models"]) { return models.map((model) => `${model.name}|${model.endpointTypes.join(",")}|${model.description ?? ""}`).join("\n"); }
function textToModels(value: string): Vendor["models"] { return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [name, types = "chat", description = ""] = line.split("|"); return { name: name.trim(), endpointTypes: types.split(",").map((type) => type.trim()).filter(Boolean), description: description.trim() || undefined }; }).filter((model) => model.name); }

async function readImage(event: ChangeEvent<HTMLInputElement>, onRead: (url: string) => void) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 1_500_000) throw new Error("请上传 1.5MB 以内的图片文件。");
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" && onRead(reader.result);
  reader.readAsDataURL(file);
}

export default function PortalContentAdminContent() {
  const { account, accountLoading } = useModals();
  const [content, setContent] = useState<PortalContent>(emptyContent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/admin/portal-content", { credentials: "same-origin" }); const body = await response.json() as PortalContent & { error?: string }; if (!response.ok) throw new Error(body.error || "加载失败"); setContent({ carousel: body.carousel ?? [], notifications: body.notifications ?? [], modelVendors: body.modelVendors ?? [] }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (account?.platform_role === "admin") void load(); }, [account?.platform_role, load]);

  async function save() {
    setSaving(true); setNotice(""); setError("");
    try { const response = await fetch("/api/admin/portal-content", { method: "PUT", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(content) }); const body = await response.json() as PortalContent & { error?: string }; if (!response.ok) throw new Error(body.error || "保存失败"); setContent({ carousel: body.carousel, notifications: body.notifications, modelVendors: body.modelVendors }); setNotice("已发布到门户，访客刷新页面后即可看到更新。"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  }

  if (accountLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在确认账户…</div>;
  if (account?.platform_role !== "admin") return <ConsolePage title="门户内容管理" description="仅平台管理员可以管理首页内容、通知与 API 模型展示。"><ConsoleEmptyState title="没有权限" description="当前账户不是平台 admin。" /></ConsolePage>;

  return <ConsolePage eyebrow="平台" title="门户内容管理" description="管理首页轮播、站内通知，以及 API 模型的六类展示。保存后会发布到个人门户。" actions={<Button type="button" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "正在发布" : "保存并发布"}</Button>}>
    {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载配置…</p> : <div className="grid gap-8">
      {notice ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}{error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <section className="grid gap-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">首页轮播图</h2><p className="text-sm text-muted-foreground">上传封面或粘贴图片地址，启用后显示在首页中部轮播。</p></div><Button variant="outline" size="sm" type="button" onClick={() => setContent((current) => ({ ...current, carousel: [...current.carousel, { id: uid("slide"), imageUrl: "", alt: "新轮播图", href: "/products?cate=api", enabled: true }] }))}><Plus className="h-4 w-4" />新增轮播</Button></div>
        {content.carousel.map((slide, index) => <div key={slide.id} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[150px_1fr_auto]"><label className="grid min-h-24 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 cursor-pointer">{slide.imageUrl ? <img src={slide.imageUrl} alt="" className="h-24 w-full object-cover" /> : <span className="grid place-items-center gap-1 text-xs text-muted-foreground"><ImagePlus className="h-5 w-5" />上传封面</span>}<input className="hidden" type="file" accept="image/*" onChange={(event) => { void readImage(event, (url) => setContent((current) => ({ ...current, carousel: current.carousel.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: url } : item) }))).catch((reason) => setError(reason.message)); }} /></label><div className="grid gap-2"><input className="h-9 rounded-md border border-border px-3 text-sm" value={slide.alt} placeholder="轮播标题" onChange={(event) => setContent((current) => ({ ...current, carousel: current.carousel.map((item, itemIndex) => itemIndex === index ? { ...item, alt: event.target.value } : item) }))} /><input className="h-9 rounded-md border border-border px-3 text-sm" value={slide.href} placeholder="跳转地址" onChange={(event) => setContent((current) => ({ ...current, carousel: current.carousel.map((item, itemIndex) => itemIndex === index ? { ...item, href: event.target.value } : item) }))} /><input className="h-9 rounded-md border border-border px-3 text-sm" value={slide.imageUrl.startsWith("data:") ? "已上传本地图片" : slide.imageUrl} placeholder="或粘贴图片 URL" onChange={(event) => !slide.imageUrl.startsWith("data:") && setContent((current) => ({ ...current, carousel: current.carousel.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: event.target.value } : item) }))} /></div><div className="flex items-start gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={slide.enabled} onChange={(event) => setContent((current) => ({ ...current, carousel: current.carousel.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item) }))} />启用</label><Button type="button" variant="ghost" size="icon" onClick={() => setContent((current) => ({ ...current, carousel: current.carousel.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></div>)}</section>
      <section className="grid gap-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">通知管理</h2><p className="text-sm text-muted-foreground">右上角通知入口会展示已启用的内容。</p></div><Button variant="outline" size="sm" type="button" onClick={() => setContent((current) => ({ ...current, notifications: [{ id: uid("notice"), title: "新通知", body: "请填写通知内容", href: "/", enabled: true, createdAt: new Date().toISOString() }, ...current.notifications] }))}><Megaphone className="h-4 w-4" />发布通知</Button></div>{content.notifications.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[1fr_1fr_auto]"><input className="h-9 rounded-md border border-border px-3 text-sm" value={item.title} placeholder="通知标题" onChange={(event) => setContent((current) => ({ ...current, notifications: current.notifications.map((notice, itemIndex) => itemIndex === index ? { ...notice, title: event.target.value } : notice) }))} /><input className="h-9 rounded-md border border-border px-3 text-sm" value={item.href} placeholder="跳转地址" onChange={(event) => setContent((current) => ({ ...current, notifications: current.notifications.map((notice, itemIndex) => itemIndex === index ? { ...notice, href: event.target.value } : notice) }))} /><div className="flex gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={item.enabled} onChange={(event) => setContent((current) => ({ ...current, notifications: current.notifications.map((notice, itemIndex) => itemIndex === index ? { ...notice, enabled: event.target.checked } : notice) }))} />启用</label><Button type="button" variant="ghost" size="icon" onClick={() => setContent((current) => ({ ...current, notifications: current.notifications.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4 text-red-500" /></Button></div><textarea className="min-h-20 rounded-md border border-border p-3 text-sm md:col-span-2" value={item.body} placeholder="通知正文" onChange={(event) => setContent((current) => ({ ...current, notifications: current.notifications.map((notice, itemIndex) => itemIndex === index ? { ...notice, body: event.target.value } : notice) }))} /></div>)}</section>
      <section className="grid gap-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">API 模型厂商</h2><p className="text-sm text-muted-foreground">按六大类配置厂商、图标和展示模型。每行模型格式：模型名 | endpoint1,endpoint2 | 简介。</p></div><Button variant="outline" size="sm" type="button" onClick={() => setContent((current) => ({ ...current, modelVendors: [...current.modelVendors, { id: uid("vendor"), name: "新厂商", key: uid("vendor"), logoUrl: "", category: "llm", enabled: true, models: [{ name: "新模型", endpointTypes: ["chat"] }] }] }))}><WandSparkles className="h-4 w-4" />新增厂商</Button></div>{content.modelVendors.map((vendor, index) => <div key={vendor.id} className="grid gap-3 rounded-xl border border-border p-4"><div className="grid gap-2 md:grid-cols-4"><label className="grid h-20 place-items-center overflow-hidden rounded-lg border border-dashed border-border cursor-pointer">{vendor.logoUrl ? <img src={vendor.logoUrl} alt="" className="h-16 max-w-24 object-contain" /> : <span className="text-xs text-muted-foreground"><Upload className="mx-auto mb-1 h-4 w-4" />上传图标</span>}<input className="hidden" type="file" accept="image/*" onChange={(event) => { void readImage(event, (url) => setContent((current) => ({ ...current, modelVendors: current.modelVendors.map((item, itemIndex) => itemIndex === index ? { ...item, logoUrl: url } : item) }))).catch((reason) => setError(reason.message)); }} /></label><input className="h-9 rounded-md border border-border px-3 text-sm" value={vendor.name} placeholder="厂商名称" onChange={(event) => setContent((current) => ({ ...current, modelVendors: current.modelVendors.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /><input className="h-9 rounded-md border border-border px-3 text-sm" value={vendor.key} placeholder="厂商标识（英文）" onChange={(event) => setContent((current) => ({ ...current, modelVendors: current.modelVendors.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) }))} /><select className="h-9 rounded-md border border-border px-3 text-sm" value={vendor.category} onChange={(event) => setContent((current) => ({ ...current, modelVendors: current.modelVendors.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value as Category } : item) }))}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><textarea className="min-h-24 rounded-md border border-border p-3 font-mono text-xs" value={modelsToText(vendor.models)} onChange={(event) => setContent((current) => ({ ...current, modelVendors: current.modelVendors.map((item, itemIndex) => itemIndex === index ? { ...item, models: textToModels(event.target.value) } : item) }))} /><div className="flex justify-between"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={vendor.enabled} onChange={(event) => setContent((current) => ({ ...current, modelVendors: current.modelVendors.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item) }))} />在目录展示</label><Button type="button" variant="ghost" size="sm" onClick={() => setContent((current) => ({ ...current, modelVendors: current.modelVendors.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="mr-1 h-4 w-4 text-red-500" />删除厂商</Button></div></div>)}</section>
    </div>}
  </ConsolePage>;
}
