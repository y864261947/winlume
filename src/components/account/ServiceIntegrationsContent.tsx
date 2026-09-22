"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, PlugZap, RefreshCw } from "lucide-react";
import { useModals } from "@/components/providers";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICE_DEFINITIONS, type PublicServiceConfig } from "@/lib/service-integrations/catalog";

const endpoint = "/api/admin/service-integrations";
async function api(body?: unknown) {
  const response = await fetch(endpoint, {
    method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试。");
  return data;
}

function ServiceEditor({ service, onUpdate }: { service: PublicServiceConfig; onUpdate: (value: PublicServiceConfig) => void }) {
  const definition = SERVICE_DEFINITIONS.find((item) => item.id === service.id)!;
  const [key, setKey] = useState("");
  const [enabled, setEnabled] = useState(service.enabled);
  const [options, setOptions] = useState(service.options);
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = Boolean(key || clearKey || enabled !== service.enabled || options.model !== service.options.model || options.voiceId !== service.options.voiceId);
  const latest = service.tests.find((test) => test.revision === service.revision);
  const status = !service.hasKey ? "等待配置" : !service.enabled ? "已停用" : "已启用";

  async function act(action: "save" | "test") {
    setBusy(action); setError(null); setNotice(null);
    try {
      const data = await api(action === "save"
        ? { id: service.id, action, config: { revision: service.revision, enabled, options, apiKey: key, clearKey } }
        : { id: service.id, action, revision: service.revision });
      onUpdate(data.service);
      setKey(""); setClearKey(false); setEnabled(data.service.enabled); setOptions(data.service.options);
      if (action === "save") setNotice("配置已保存。");
      else if (data.result.ok) setNotice("测试通过，已成功调用实际接口。");
      else setError(data.result.message);
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败，请稍后重试。"); }
    finally { setBusy(null); }
  }

  return <article className="overflow-hidden rounded-xl border border-border bg-background">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div><h2 className="text-base font-semibold">{definition.name}<span className="ml-3 text-xs font-normal text-muted-foreground">{definition.capability}</span></h2><p className="mt-1 text-sm text-muted-foreground">{definition.description}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${service.enabled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{status}</span>
    </div>
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-4 disabled:opacity-70">
        <div><p className="text-xs font-medium text-muted-foreground">官方接口</p><p className="mt-1 break-all text-sm">{definition.endpoint}</p></div>
        <label className="block space-y-2"><span className="text-sm font-medium">API Key <span className="font-normal text-muted-foreground">{service.hasKey ? "已安全保存" : "尚未配置"}</span></span>
          <Input type="password" autoComplete="new-password" value={key} disabled={clearKey || Boolean(busy)} maxLength={4096} placeholder={service.hasKey ? "留空保留原 Key，输入新 Key 可更换" : "粘贴供应商 API Key"} onChange={(event) => setKey(event.target.value)} />
        </label>
        {service.id === "elevenlabs" && <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm"><span>模型 ID</span><Input value={options.model} maxLength={100} onChange={(event) => setOptions({ ...options, model: event.target.value })} /></label>
          <label className="space-y-2 text-sm"><span>音色 ID</span><Input value={options.voiceId} maxLength={100} onChange={(event) => setOptions({ ...options, voiceId: event.target.value })} /></label>
        </div>}
        <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={clearKey || Boolean(busy)} onChange={(event) => setEnabled(event.target.checked)} />启用服务</label>
          {service.hasKey && <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={clearKey} onChange={(event) => { setClearKey(event.target.checked); if (event.target.checked) { setEnabled(false); setKey(""); } }} />清除已保存的 Key</label>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void act("save")} disabled={Boolean(busy) || !dirty}>{busy === "save" && <LoaderCircle className="size-4 animate-spin" />}保存配置</Button>
          <a href={definition.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">获取 API Key<ExternalLink className="size-3.5" /></a>
        </div>
      </fieldset>
      <div className="space-y-3 rounded-lg bg-muted/40 p-4">
        <h3 className="text-sm font-medium">连接测试</h3>
        <p className="text-sm text-muted-foreground">{definition.testDescription}</p>
        <p className="text-xs text-muted-foreground">{dirty ? "请先保存配置，再测试。" : !service.hasKey ? "保存 Key 后即可测试，无需先启用。" : latest ? `${latest.ok ? "最近测试通过" : "最近测试失败"} · ${latest.latencyMs} ms` : "当前配置尚未测试。"}</p>
        <Button variant="outline" disabled={Boolean(busy) || dirty || !service.hasKey} onClick={() => void act("test")}>{busy === "test" ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}测试已保存配置</Button>
        <p className="text-xs leading-5 text-muted-foreground">测试直接使用供应商额度，不扣用户钱包。每次测试需间隔 30 秒。</p>
      </div>
    </div>
    {(error || notice) && <p role={error ? "alert" : "status"} className={`px-5 pb-4 text-sm ${error ? "text-red-600" : "text-emerald-700"}`}>{error || notice}</p>}
    {service.tests.length > 0 && <details className="border-t border-border px-5 py-3"><summary className="cursor-pointer text-sm text-muted-foreground">最近测试记录（{service.tests.length}）</summary><ul className="mt-3 space-y-3">{service.tests.map((test, index) => <li key={`${test.at}-${index}`} className="text-xs leading-5"><span className={test.ok ? "text-emerald-700" : "text-red-600"}>{test.ok ? "通过" : "失败"}</span><span className="ml-2 text-muted-foreground">{new Date(test.at).toLocaleString()} · {test.latencyMs} ms{test.revision !== service.revision ? " · 旧配置" : ""}</span><p>{test.message}{test.usage ? ` 用量：${test.usage}` : ""}</p></li>)}</ul></details>}
  </article>;
}

export default function ServiceIntegrationsContent() {
  const { account, accountLoading } = useModals();
  const [services, setServices] = useState<PublicServiceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const data = await api(); setServices(data.services); }
    catch (err) { setError(err instanceof Error ? err.message : "加载失败。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (account?.platform_role !== "admin") return;
    let cancelled = false;
    api().then((data) => { if (!cancelled) setServices(data.services); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "加载失败。"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account?.platform_role]);
  if (accountLoading) return <ConsolePage title="服务接入"><p role="status">正在加载…</p></ConsolePage>;
  if (account?.platform_role !== "admin") return <ConsolePage title="服务接入"><ConsoleEmptyState title="仅平台管理员可访问" description="请使用平台管理员账号登录后管理服务。" /></ConsolePage>;
  return <ConsolePage title="服务接入" description="维护搜索、网页读取与语音服务的凭据，保存后可直接测试。" actions={<Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" />刷新</Button>}>
    <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">这里维护 Reizo 直连服务。Jina 向量与重排序、Groq 和 OpenRouter 模型渠道继续在 New API 配置。启用服务不会自动发布首页目录，也不会自动接入工作台或开放用户计费调用。</div>
    {error ? <div role="alert" className="text-sm text-red-600">{error}<Button className="ml-3" variant="outline" onClick={() => void load()}>重试</Button></div> : loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在加载服务配置…</p> : <div className="grid gap-5">{services.map((service) => <ServiceEditor key={service.id} service={service} onUpdate={(next) => setServices((items) => items.map((item) => item.id === next.id ? next : item))} />)}</div>}
  </ConsolePage>;
}
