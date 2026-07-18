"use client";

import { useEffect, useState } from "react";
import { Boxes, ExternalLink, LoaderCircle } from "lucide-react";
import { fetchPlaza, type PlazaModel } from "@/lib/catalog";
import { useModals } from "./providers";

function priceLabel(model: PlazaModel) {
  return model.quota_type === 1 ? `${model.model_price.toFixed(2)} / 次` : `输入倍率 ${model.model_ratio}x`;
}

export default function PublicModelPlaza() {
  const { openExperience } = useModals();
  const [models, setModels] = useState<PlazaModel[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [vendors, setVendors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPlaza()
      .then((data) => {
        if (cancelled) return;
        setModels(data.models.slice(0, 12));
        setTotal(data.total);
        setVendors(data.vendors);
        setLoading(false);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "模型广场暂时不可访问。");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [retryCount]);

  const retry = () => {
    setError("");
    setLoading(true);
    setRetryCount((count) => count + 1);
  };

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><Boxes className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-ink-900">模型广场</p><p className="mt-0.5 text-xs text-ink-500">平台公开模型目录，所有访客均可浏览，无需登录。</p></div></div>
        <span className="rounded-full bg-primary-50 px-2.5 py-1 font-mono text-xs font-semibold text-primary-700 ring-1 ring-primary-100">{total === null ? "同步中" : `${total} 个模型`}</span>
      </div>
      {error ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-5">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-rose-300 bg-surface px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
          >
            重试
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 px-4 py-5 text-sm text-ink-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />正在同步模型广场</div>
      ) : (
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {models.map((model) => <article key={model.model_name} className="group bg-surface p-4 transition hover:bg-canvas"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-all font-mono text-sm font-semibold text-ink-900">{model.model_name}</p><button type="button" onClick={() => openExperience(model.model_name)} title={`在体验工作台中使用 ${model.model_name}`} aria-label={`在体验工作台中使用 ${model.model_name}`} className="shrink-0 rounded-md p-1.5 text-ink-400 transition hover:bg-surface hover:text-primary-600"><ExternalLink className="h-3.5 w-3.5" /></button></div><p className="mt-2 min-h-10 text-xs leading-5 text-ink-500">{vendors[model.vendor_id ?? 0] ?? "公开模型"} · {priceLabel(model)}</p><div className="mt-3 flex flex-wrap gap-1">{(model.supported_endpoint_types ?? []).slice(0, 3).map((endpoint) => <span key={endpoint} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-500">{endpoint}</span>)}</div></article>)}
        </div>
      )}
    </section>
  );
}
