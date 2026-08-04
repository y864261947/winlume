"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CircleAlert,
  RefreshCw,
} from "lucide-react";
import {
  listWorkflowPacks,
  StudioApiError,
  type WorkflowPackCatalogEntry,
} from "@/lib/studio/api";

type WorkflowPackSectionProps = {
  scene: string;
  query: string;
};

type PackLoadState = {
  requestKey: string;
  status: "loading" | "ready" | "error";
  packs: WorkflowPackCatalogEntry[];
  error: string | null;
};

function packHref(packId: string, scene: string): string {
  const path = `/studio/packs/${encodeURIComponent(packId)}`;
  return scene ? `${path}?scene=${encodeURIComponent(scene)}` : path;
}

function unavailableReasons(pack: WorkflowPackCatalogEntry): string[] {
  return pack.availability.requirements
    .filter((requirement) => requirement.availability !== "available")
    .map((requirement) => requirement.reason ?? `${requirement.id} 不可用`);
}

function PackSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="正在加载专业工作流"
      className="mb-7 min-h-[182px] border-b border-line pb-6"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-700">
        <BriefcaseBusiness className="h-4 w-4 text-primary-500" />
        专业工作流
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg border border-line bg-surface"
          />
        ))}
      </div>
    </section>
  );
}

export function WorkflowPackSection({
  scene,
  query,
}: WorkflowPackSectionProps) {
  const [retryVersion, setRetryVersion] = useState(0);
  const requestKey = JSON.stringify([scene, retryVersion]);
  const [loadState, setLoadState] = useState<PackLoadState>(() => ({
    requestKey,
    status: "loading",
    packs: [],
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;

    void listWorkflowPacks(scene || undefined)
      .then((nextPacks) => {
        if (cancelled) return;
        setLoadState({
          requestKey,
          status: "ready",
          packs: nextPacks,
          error: null,
        });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoadState({
          requestKey,
          status: "error",
          packs: [],
          error:
            reason instanceof StudioApiError
              ? reason.message
              : "加载专业工作流失败",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey, scene]);

  const hasCurrentResult = loadState.requestKey === requestKey;
  const loading = !hasCurrentResult || loadState.status === "loading";
  const error = hasCurrentResult ? loadState.error : null;

  const filteredPacks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visiblePacks = hasCurrentResult ? loadState.packs : [];
    if (!normalizedQuery) return visiblePacks;
    return visiblePacks.filter((pack) =>
      [pack.title, pack.summary].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [hasCurrentResult, loadState.packs, query]);

  const retry = useCallback(() => {
    setRetryVersion((version) => version + 1);
  }, []);

  if (loading) return <PackSkeleton />;

  if (error) {
    return (
      <section
        aria-label="专业工作流"
        className="mb-7 min-h-[92px] border-b border-line pb-6"
      >
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
        >
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={retry}
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </button>
        </div>
      </section>
    );
  }

  if (filteredPacks.length === 0) return null;

  return (
    <section aria-labelledby="workflow-packs-heading" className="mb-7 border-b border-line pb-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            id="workflow-packs-heading"
            className="flex items-center gap-2 text-sm font-semibold text-ink-900"
          >
            <BriefcaseBusiness className="h-4 w-4 text-primary-500" />
            专业工作流
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            按阶段组织输入、产出和审核。
          </p>
        </div>
        <span className="shrink-0 tabular-nums text-xs text-ink-400">
          {filteredPacks.length} 个
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredPacks.map((pack) => {
          const reasons = unavailableReasons(pack);
          const unavailable = !pack.availability.available;
          const unavailableReason = reasons.length
            ? reasons.join("；")
            : "所需能力暂不可用";
          const outputLabel = pack.expectedArtifacts.length
            ? `${pack.expectedArtifacts.length} 项预期产物`
            : "阶段产物按合同生成";

          return (
            <Link
              key={pack.id}
              href={packHref(pack.id, scene)}
              className={`group min-h-28 rounded-lg border p-3.5 transition focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                unavailable
                  ? "border-amber-200 bg-amber-50/40 hover:border-amber-300"
                  : "border-line bg-surface hover:border-primary-200 hover:bg-canvas"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-900">
                  {pack.title}
                </h3>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-primary-600" />
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-ink-500">
                {pack.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
                <span>{pack.stages.length} 个阶段</span>
                <span aria-hidden="true">·</span>
                <span>{outputLabel}</span>
                <span
                  className={`ml-auto shrink-0 rounded px-1.5 py-0.5 font-medium ${
                    unavailable
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {unavailable ? "暂不可用" : "可用"}
                </span>
              </div>
              {unavailable ? (
                <p className="mt-2 line-clamp-1 text-[11px] leading-4 text-amber-800">
                  {unavailableReason}
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
