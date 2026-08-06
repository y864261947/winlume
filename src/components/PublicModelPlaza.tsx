"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { fetchPlaza, type PlazaModel } from "@/lib/catalog";
import { ModelPlazaCard } from "@/components/ModelPlazaCard";

export default function PublicModelPlaza() {
  const [models, setModels] = useState<PlazaModel[]>([]);
  const [total, setTotal] = useState<number | null>(null);
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
        setLoading(false);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "模型广场暂时不可访问。");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const retry = () => {
    setError("");
    setLoading(true);
    setRetryCount((count) => count + 1);
  };

  return (
    <section className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">模型广场</p>
          <p className="mt-0.5 text-xs text-slate-500">
            定价目录实时成列，风格对齐主流模型市场；价格与 Gateway 计费同源。
          </p>
        </div>
        <span className="rounded-full bg-violet-50 px-2.5 py-1 font-mono text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
          {total === null ? "同步中" : `${total} 个模型`}
        </span>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
          >
            重试
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-500" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在同步模型广场
        </div>
      ) : models.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          暂无已导入的定价模型。
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {models.map((model) => (
            <ModelPlazaCard key={model.model_name} model={model} />
          ))}
        </div>
      )}
    </section>
  );
}
