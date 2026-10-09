"use client";
import Link from "next/link";
import Image from "next/image";


import { useEffect, useMemo, useState } from "react";
import { fetchPlaza, type PlazaModel } from "@/lib/catalog";
import { modelPriceLines, resolvePlazaVendor } from "@/lib/catalog/plaza-display";
import { getVendorByKey, type PlazaVendor } from "@/lib/catalog/vendors";
import ReizoHeader from "./ReizoHeader";
import ReizoFooter from "./ReizoFooter";
import apiHero from "./generated/api-hero.json";

const categories: Record<string, string> = { all: "全部模型", llm: "文本与推理", image: "图像生成", video: "视频生成", audio: "语音与音频", embed: "向量与检索", other: "其他能力" };
function Price({ model }: { model: PlazaModel }) {
  const price = modelPriceLines(model);
  return price.kind === "ratio" ? <div className="reizo-model-price"><span>{price.input}</span><span>{price.output}</span></div> : <span>{price.text}</span>;
}

function VendorMark({ vendor }: { vendor: PlazaVendor }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = [...new Set([vendor.logo, getVendorByKey(vendor.key).logo, "/vendors/other.svg"])];
  const source = sources[sourceIndex];
  return <span className="reizo-vendor-mark">
    {source ? <Image src={source} alt="" width={24} height={24} unoptimized
      onError={() => setSourceIndex(index => index + 1)} /> : <span aria-hidden="true">{vendor.name.slice(0, 1)}</span>}
  </span>;
}

export function ModelCatalog() {
  const [models, setModels] = useState<PlazaModel[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchPlaza({ fresh: attempt > 0 }).then(data => { if (!cancelled) { setModels(data.models); setStatus("ready"); } }).catch(reason => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "模型目录暂不可用"); setStatus("error"); } });
    return () => { cancelled = true; };
  }, [attempt]);
  const vendors = useMemo(() => Array.from(new Set(models.map(model => resolvePlazaVendor(model).name))).sort(), [models]);
  const filtered = useMemo(() => models.filter(model => (category === "all" || model.portal_category === category) && (vendor === "all" || resolvePlazaVendor(model).name === vendor) && `${model.model_name} ${resolvePlazaVendor(model).name}`.toLowerCase().includes(query.toLowerCase())), [models, category, vendor, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, totalPages);
  return <section className="catalog-section shell" id="catalog" aria-labelledby="catalog-title">
    <div className="section-heading"><div><p className="eyebrow">模型目录</p><h2 id="catalog-title">模型与价格，一目了然。</h2></div><p>按任务找到合适的模型，<br />查看当前费率，再开始调用。</p></div>
    <div className="reizo-catalog-filters"><label className="reizo-search"><span className="sr-only">搜索模型</span><input type="search" placeholder="搜索模型名称或提供方" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label><span className="sr-only">提供方</span><select value={vendor} onChange={event => { setVendor(event.target.value); setPage(1); }}><option value="all">全部提供方</option>{vendors.map(name => <option key={name}>{name}</option>)}</select></label></div>
    <div className="reizo-category-tabs" aria-label="模型类型">{Object.entries(categories).map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setPage(1); }}>{label}</button>)}</div>
    <p className="reizo-catalog-meta" role="status">{status === "ready" ? `${filtered.length} 个模型 · 价格以实际调用的模型、参数与账户分组为准` : status === "loading" ? "正在读取模型目录…" : "模型目录暂不可用"}</p>
    {status === "error" ? <div className="reizo-empty" role="alert"><p>{error}</p><button className="button" onClick={() => { setStatus("loading"); setAttempt(attempt + 1); }}>重新加载</button></div> : status === "loading" ? <div className="reizo-empty">正在同步模型与价格…</div> : filtered.length === 0 ? <div className="reizo-empty">没有匹配的模型，请调整搜索或筛选条件。</div> : <div className="reizo-table-scroll"><table className="reizo-model-table"><thead><tr><th>模型 / 提供方</th><th>能力</th><th>参考价格</th><th>状态</th><th>开始使用</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 8, currentPage * 8).map(model => { const vendor = resolvePlazaVendor(model); return <tr key={model.model_name}><td><div className="model-identity"><VendorMark key={`${vendor.key}:${vendor.logo}`} vendor={vendor} /><div><strong>{model.model_name}</strong><small>{vendor.name}</small></div></div></td><td>{categories[model.portal_category || "other"]}</td><td><Price model={model} /></td><td><span className="model-status">{model.catalog_only ? "目录展示" : "已接入"}</span></td><td><Link className="text-link" href={model.catalog_only ? "/docs" : `/studio?model=${encodeURIComponent(model.model_name)}`}>{model.catalog_only ? "查看文档" : "使用模型"} ↗</Link></td></tr>; })}</tbody></table></div>}
    {status === "ready" && filtered.length > 0 && <div className="reizo-pagination"><span>{currentPage} / {totalPages}</span><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</button><button disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
  </section>;
}

export default function ApiPage() {
  const [language, setLanguage] = useState("Python");
  const [copyStatus, setCopyStatus] = useState("");
  const [base, setBase] = useState("/api/v1");
  useEffect(() => { const timer = window.setTimeout(() => setBase(`${window.location.origin}/api/v1`), 0); return () => window.clearTimeout(timer); }, []);
  const examples: Record<string, string> = {
    Python: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="YOUR_REIZO_API_KEY",\n    base_url="${base}"\n)\n\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_ID",\n    messages=[{"role": "user", "content": "你好"}]\n)\nprint(response.choices[0].message.content)`,
    JavaScript: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.REIZO_API_KEY,\n  baseURL: "${base}",\n});\n\nconst response = await client.chat.completions.create({\n  model: "YOUR_MODEL_ID",\n  messages: [{ role: "user", content: "你好" }],\n});`,
    cURL: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer YOUR_REIZO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"YOUR_MODEL_ID","messages":[{"role":"user","content":"你好"}]}'`,
  };
  return <div className="reizo-site reizo-page-api api-page"><ReizoHeader /><main id="main">
    <section className="api-hero shell" dangerouslySetInnerHTML={apiHero} />
    <ModelCatalog />
    <section className="quickstart-section" id="quickstart"><div className="shell api-grid"><div className="section-copy"><p className="eyebrow">开始接入</p><h2>从第一次调用，<br />开始构建。</h2><p>在账户中心创建密钥，从目录中复制模型名称。使用兼容 OpenAI 的调用方式接入，凭据保留在你的服务端。</p><Link className="text-link" href="/docs">查看完整开发文档 ↗</Link></div><div className="code-window"><div className="code-toolbar"><div className="code-tabs">{Object.keys(examples).map(name => <button key={name} aria-pressed={language === name} onClick={() => { setLanguage(name); setCopyStatus(""); }}>{name}</button>)}</div><button className="reizo-copy" onClick={async () => { try { await navigator.clipboard.writeText(examples[language]); setCopyStatus("已复制"); } catch { setCopyStatus("请手动复制代码"); } }}>复制代码</button></div><pre className="reizo-code"><code>{examples[language]}</code></pre><div className="code-footer" role="status">{copyStatus || "将 YOUR_MODEL_ID 替换为目录中的模型名称"}</div></div></div></section>
    <section className="billing-section shell" id="billing"><div className="section-heading"><h2>按实际用量，<br />掌握每一次调用成本。</h2><p>余额、密钥和调用记录，集中管理。</p></div><div className="benefits-grid">{[["按量计费", "文本按 Token、部分多模态能力按次或参数计费，详情以目录与实际结算为准。", "/pricing"], ["余额与充值", "工作台与 API 共用账户余额，在钱包查看充值和扣费明细。", "/account/wallet"], ["调用可追溯", "按模型、时间和密钥查看调用记录，了解每一次使用。", "/account/logs"]].map(([title, text, href]) => <Link key={title} className="benefit-card" href={href}><h3>{title}</h3><p>{text}</p></Link>)}</div></section>
  </main><ReizoFooter /></div>;
}
