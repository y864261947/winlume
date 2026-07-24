"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Boxes } from "lucide-react";
import { fetchPlaza, type PlazaModel } from "@/lib/catalog";

function displayPrice(model: PlazaModel) {
  if (model.quota_type === 1) return `$${model.model_price.toFixed(2)} / 次`;
  return `输入 ${model.model_ratio}x · 输出 ${model.completion_ratio ?? 1}x`;
}

export function RealModelGrid({ limit = 12, compact = false }: { limit?: number; compact?: boolean }) {
  const [models, setModels] = useState<PlazaModel[]>([]);
  const [vendors, setVendors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPlaza()
      .then((data) => {
        if (cancelled) return;
        setModels(data.models.slice(0, limit));
        setVendors(data.vendors);
        setLoading(false);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "模型广场暂时不可访问。");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [limit, retryCount]);

  const retry = () => {
    setError("");
    setLoading(true);
    setRetryCount((count) => count + 1);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center">
        <p className="text-sm text-rose-700">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-rose-300 bg-surface px-3.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
        >
          重试
        </button>
      </div>
    );
  }

  // 骨架按真实卡片的高度与列数占位，避免加载完成后页面跳动
  if (loading) {
    return (
      <div className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`} aria-label="正在同步真实模型" role="status">
        {Array.from({ length: compact ? 6 : 4 }).map((_, index) => (
          <div key={index} className="min-h-52 animate-pulse rounded-lg border border-line bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
      {models.map((model) => (
        <article
          key={model.model_name}
          className="spectrum-card flex min-h-52 flex-col rounded-lg border border-line bg-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-ink-950/5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-ink-500">
              <Boxes className="h-3.5 w-3.5 text-primary-500" />
              {vendors[model.vendor_id ?? 0] ?? "公开模型"}
            </span>
            <span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[10px] text-ink-500 ring-1 ring-line">
              {model.quota_type === 1 ? "按次" : "Token"}
            </span>
          </div>
          <p className="mt-3 break-all font-mono text-sm font-semibold text-ink-900">{model.model_name}</p>
          <p className="mt-3 rounded-md bg-canvas px-2.5 py-2 font-mono text-xs text-ink-700 ring-1 ring-line">
            {displayPrice(model)}
          </p>
          <div className="mt-3 flex min-h-5 flex-wrap gap-1">
            {(model.supported_endpoint_types ?? []).slice(0, 2).map((endpoint) => (
              <span key={endpoint} className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-500">
                {endpoint}
              </span>
            ))}
          </div>
          <Link
            href={`/studio?model=${encodeURIComponent(model.model_name)}`}
            className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-primary-500 py-1.5 text-xs font-medium text-white transition hover:bg-primary-600"
          >
            立即体验
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </article>
      ))}
    </div>
  );
}
