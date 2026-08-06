"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchPlaza, type PlazaModel } from "@/lib/catalog";
import { ModelPlazaCard } from "@/components/ModelPlazaCard";
import {
  filterPlazaModels,
  type PlazaCapabilityFilter,
} from "@/lib/catalog/plaza-filters";

export type RealModelGridProps = {
  limit?: number;
  compact?: boolean;
  query?: string;
  vendorKey?: string;
  capability?: PlazaCapabilityFilter;
  /** Report full (unfiltered) and filtered counts to parent chrome */
  onStats?: (stats: { total: number; filtered: number; models: PlazaModel[] }) => void;
};

export function RealModelGrid({
  limit = 12,
  compact = false,
  query = "",
  vendorKey,
  capability = "all",
  onStats,
}: RealModelGridProps) {
  const [models, setModels] = useState<PlazaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPlaza()
      .then((data) => {
        if (cancelled) return;
        setModels(data.models);
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

  const filtered = useMemo(
    () => filterPlazaModels(models, { query, vendorKey, capability }),
    [models, query, vendorKey, capability],
  );

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  useEffect(() => {
    onStats?.({ total: models.length, filtered: filtered.length, models });
  }, [models, filtered, onStats]);

  const retry = () => {
    setError("");
    setLoading(true);
    setRetryCount((count) => count + 1);
  };

  const gridClass = compact
    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[10px] border border-[#f3c4c4] bg-[#fff7f7] px-4 py-8 text-center">
        <p className="text-sm text-[#b42318]">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-[#f3c4c4] bg-white px-3.5 py-1.5 text-xs font-medium text-[#b42318] transition hover:bg-[#fff1f0]"
        >
          重试
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={gridClass} aria-label="正在同步模型广场" role="status">
        {Array.from({ length: compact ? 8 : 10 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-[10px] border border-[rgba(120,150,180,.22)] bg-white">
            <div className="h-36 animate-pulse bg-[#eef3f8] sm:h-40" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#eef3f8]" />
              <div className="h-3 w-full animate-pulse rounded bg-[#eef3f8]" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#eef3f8]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-[rgba(120,150,180,.35)] bg-[rgba(255,255,255,.7)] px-4 py-10 text-center text-sm text-[#596978]">
        {models.length === 0 ? "暂无已导入的定价模型。" : "没有符合当前筛选的模型，试试清除筛选。"}
      </p>
    );
  }

  return (
    <div className={gridClass}>
      {visible.map((model) => (
        <ModelPlazaCard key={model.model_name} model={model} />
      ))}
    </div>
  );
}
