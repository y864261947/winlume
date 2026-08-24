"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  Database,
  FileSearch,
  MessageSquareText,
  Search,
  SlidersHorizontal,
  Volume2,
  Video,
  X,
} from "lucide-react";
import ApplicationDirectory from "@/components/ApplicationDirectory";
import PortalHeader from "@/components/PortalHeader";
import { RealModelGrid } from "@/components/RealModelGrid";
import {
  type PlazaCapabilityFilter,
  vendorsPresentIn,
} from "@/lib/catalog/plaza-filters";
import type { PlazaModel } from "@/lib/catalog";
import { modelDescription, modelPriceLines, modelTags, resolvePlazaVendor } from "@/lib/catalog/plaza-display";

interface Props {
  initialCate?: string;
  initialTag?: string;
  initialBrand?: string;
  initialQuery?: string;
}

type ViewMode = "models" | "apps";

const MODEL_CATEGORIES = [
  { id: "llm", label: "语言推理", providers: "OpenAI · Anthropic · Gemini", icon: MessageSquareText },
  { id: "image", label: "图像处理", providers: "DALL·E · FLUX · Stability AI", icon: FileSearch },
  { id: "video", label: "视频处理", providers: "Sora · Kling · Runway · Pika", icon: Video },
  { id: "audio", label: "音频处理", providers: "Whisper · ElevenLabs · MiniMax", icon: Volume2 },
  { id: "embed", label: "RAG 知识库", providers: "Embedding · Rerank · Vector", icon: Database },
  { id: "other", label: "信息检索", providers: "Jina AI · Cohere · Google", icon: Search },
] as const;

function resolveMode(initialCate?: string): ViewMode {
  if (initialCate === "app") return "apps";
  return "models";
}

export default function ProductsExplorer({
  initialCate,
  initialBrand,
  initialQuery,
}: Props) {
  const router = useRouter();

  const mode = resolveMode(initialCate);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [vendorKey, setVendorKey] = useState<string | undefined>(initialBrand);
  const [capability, setCapability] = useState<PlazaCapabilityFilter>("all");
  const [plazaModels, setPlazaModels] = useState<PlazaModel[]>([]);
  const [plazaStats, setPlazaStats] = useState({ total: 0, filtered: 0 });
  const [selectedModel, setSelectedModel] = useState<PlazaModel | null>(null);

  useEffect(() => {
    if (mode === "apps") return;
    const params = new URLSearchParams();
    params.set("cate", "api");
    if (query.trim()) params.set("q", query.trim());
    router.replace(`/products?${params.toString()}`, { scroll: false });
  }, [mode, query, router]);

  const onPlazaStats = useCallback(
    (stats: { total: number; filtered: number; models: PlazaModel[] }) => {
      setPlazaStats({ total: stats.total, filtered: stats.filtered });
      setPlazaModels(stats.models);
      setSelectedModel((current) => current ?? stats.models[0] ?? null);
    },
    [],
  );

  const vendorChips = useMemo(() => vendorsPresentIn(plazaModels), [plazaModels]);

  const resetModelFilters = () => {
    setQuery("");
    setVendorKey(undefined);
    setCapability("all");
  };

  const hasModelFilters = Boolean(query || vendorKey || capability !== "all");

  return (
    <div className="portal-home">
      <div className="portal-frame pb-16">
        <PortalHeader productMode={mode === "apps" ? "app" : "api"} />

        {mode === "apps" ? (
          <ApplicationDirectory initialQuery={initialQuery} />
        ) : (
        <div className="portal-directory-layout">
          <aside className="portal-directory-side">
            <h2>API模型</h2>
            <button type="button" className={`portal-directory-all ${capability === "all" ? "is-active" : ""}`} onClick={resetModelFilters}>
              全部模型<ChevronRight aria-hidden />
            </button>
            {MODEL_CATEGORIES.map(({ id, label, providers, icon: Icon }) => (
              <button key={id} type="button" className="portal-directory-model-row" data-active={capability === id || undefined} onClick={() => setCapability(id as PlazaCapabilityFilter)}>
                <Icon aria-hidden />
                <span><strong>{label}</strong><small>{providers}</small></span><ChevronRight aria-hidden />
              </button>
            ))}
          </aside>
          <div className="portal-directory-main">
        <section className="portal-catalog-hero">
          <div className="portal-catalog-title-row">
            <div>
              <h1>全部 API 模型</h1>
              <p className="portal-catalog-lead">
                汇集全球优质 AI 模型，通过 API 快速集成到你的应用中。
              </p>
            </div>
            <div className="portal-catalog-hero-links"><Link href="/docs/api"><BookOpen aria-hidden /> API 文档</Link><Link href="/pricing">计费说明</Link></div>
          </div>
          <form
            className="portal-catalog-search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索模型"
              placeholder="搜索模型名称、厂商，例如 gpt-5.5、claude、deepseek…"
            />
            {query ? (
              <button
                type="button"
                className="portal-catalog-clear"
                onClick={() => setQuery("")}
                aria-label="清除搜索"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <button type="submit">
              <Search aria-hidden />
              搜索
            </button>
          </form>
          {plazaStats.total > 0 ? (
            <p className="portal-catalog-search-hint">
              {hasModelFilters
                ? `匹配 ${plazaStats.filtered} / ${plazaStats.total} 个模型`
                : `共 ${plazaStats.total} 个模型可检索`}
            </p>
          ) : null}
        </section>

        <div className="portal-model-controls" aria-label="模型筛选">
          <button type="button" onClick={() => setVendorKey(undefined)}>厂商 <ChevronRight aria-hidden /></button>
          <button type="button" onClick={() => setCapability("all")}>能力 <ChevronRight aria-hidden /></button>
          <button type="button" onClick={resetModelFilters}>价格 <ChevronRight aria-hidden /></button>
          <button type="button" onClick={() => setCapability("llm")}>上下文 <ChevronRight aria-hidden /></button>
          <button type="button" className="portal-model-control-sort">排序：综合推荐 <ChevronRight aria-hidden /></button>
          <button type="button" className="portal-model-control-sliders" aria-label="更多筛选"><SlidersHorizontal aria-hidden /></button>
        </div>

        {vendorChips.length > 0 ? (
          <div className="portal-model-vendor-strip">
            <div className="portal-model-strip-title"><span>🔥</span><strong>热门推荐</strong></div>
            <div className="portal-model-vendor-scroller">
              {vendorChips.slice(0, 7).map((vendor) => (
                <button key={vendor.key} type="button" className={vendorKey === vendor.key ? "is-selected" : undefined} onClick={() => setVendorKey(vendor.key === vendorKey ? undefined : vendor.key)}>
                  <img src={vendor.logo} alt="" width={26} height={26} />
                  <span>{vendor.brandLabel}</span><small>{vendor.count} 个模型</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="portal-catalog-section-head">
          <div>
            <h2>全部模型</h2>
            <p>
              {hasModelFilters
              ? `已筛选 ${plazaStats.filtered} / ${plazaStats.total} 个模型`
                : `共 ${plazaStats.total || "—"} 个模型`}
            </p>
          </div>
          {hasModelFilters ? (
            <button type="button" className="portal-arrow-link" onClick={resetModelFilters}>
              清除筛选
            </button>
          ) : (
            <span className="portal-catalog-meta">PRICING CATALOG</span>
          )}
        </div>

        <div className={`portal-model-directory${selectedModel ? " has-detail" : ""}`}>
        <RealModelGrid
          limit={240}
          compact
          query={query}
          vendorKey={vendorKey}
          capability={capability}
          onStats={onPlazaStats}
          onClearFilters={resetModelFilters}
          selectedModelName={selectedModel?.model_name}
          onSelectModel={setSelectedModel}
          variant="directory"
        />
        {selectedModel ? (() => {
          const vendor = resolvePlazaVendor(selectedModel, { name: selectedModel.vendor_name, logo: selectedModel.vendor_logo });
          const price = modelPriceLines(selectedModel);
          return <aside className="portal-model-detail">
            <button type="button" className="portal-model-detail-close" onClick={() => setSelectedModel(null)}><X aria-hidden /></button>
            <div className="portal-model-detail-brand"><img src={vendor.logo} alt="" /><div><h2>{selectedModel.model_name}</h2><span>{vendor.brandLabel}</span></div></div>
            <p>{modelDescription(selectedModel, vendor)}</p>
            <div className="portal-model-detail-tags">{modelTags(selectedModel).map((tag) => <span key={tag.label}>{tag.label}</span>)}</div>
            <dl><div><dt>计费方式</dt><dd>{price.kind === "fixed" || price.kind === "tiered" ? price.text : `${price.input} / ${price.output}`}</dd></div><div><dt>调用协议</dt><dd>HTTPS / JSON</dd></div><div><dt>端点能力</dt><dd>{selectedModel.supported_endpoint_types?.join("、") || "标准模型调用"}</dd></div></dl>
            <h3>适合场景</h3><ul><li>复杂推理与问题解答</li><li>内容生成与信息处理</li><li>Agent 与自动化任务</li></ul>
            <div className="portal-model-detail-actions"><Link href="/docs/api">查看 API 文档</Link><Link href={`/studio?model=${encodeURIComponent(selectedModel.model_name)}`}>立即调用 API</Link></div>
          </aside>;
        })() : null}
        </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
