"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  FileText,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import Modal, { ModalCloseButton } from "@/components/Modal";
import ArtifactPreview from "@/components/studio/ArtifactPreview";
import type { Artifact, ArtifactKind } from "@/lib/agent/types";
import type { IntakeField } from "@/lib/agent/production-packs/contracts";
import { getArtifact, StudioApiError } from "@/lib/studio/api";

type ArtifactIntakeField = Extract<IntakeField, { type: "artifact" }>;

type WorkflowArtifactPickerProps = {
  field: ArtifactIntakeField;
  value: string;
  artifacts: Artifact[];
  loading: boolean;
  loadError: string | null;
  controlId: string;
  describedBy: string;
  invalid: boolean;
  onChange: (artifactId: string) => void;
  onRetry: () => void;
  onUnauthorized: () => void;
};

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  video: "视频",
  "video-analysis": "视频拆解",
  binary: "二进制",
  canvas: "画布",
  sheet: "表格",
};

export function WorkflowArtifactPicker({
  field,
  value,
  artifacts,
  loading,
  loadError,
  controlId,
  describedBy,
  invalid,
  onChange,
  onRetry,
  onUnauthorized,
}: WorkflowArtifactPickerProps) {
  const [query, setQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRequest = useRef(0);

  const allowedKinds = useMemo(() => new Set<ArtifactKind>(field.kinds), [field.kinds]);
  const selected = artifacts.find((artifact) => artifact.id === value) ?? null;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return artifacts.filter((artifact) => {
      if (!allowedKinds.has(artifact.kind)) return false;
      if (!normalized) return true;
      return [artifact.name, artifact.id, KIND_LABELS[artifact.kind]].some((candidate) =>
        candidate.toLocaleLowerCase().includes(normalized),
      );
    });
  }, [allowedKinds, artifacts, query]);

  const closePreview = useCallback(() => {
    previewRequest.current += 1;
    setPreviewOpen(false);
  }, []);

  const openPreview = useCallback(
    async (artifactId: string) => {
      const request = previewRequest.current + 1;
      previewRequest.current = request;
      const knownArtifact = artifacts.find((artifact) => artifact.id === artifactId) ?? null;
      setPreviewArtifact(knownArtifact);
      setPreviewContent(null);
      setPreviewError(null);
      setPreviewLoading(true);
      setPreviewOpen(true);
      try {
        const result = await getArtifact(artifactId);
        if (previewRequest.current !== request) return;
        setPreviewArtifact(result.artifact);
        setPreviewContent(result.content);
      } catch (reason: unknown) {
        if (previewRequest.current !== request) return;
        if (reason instanceof StudioApiError && reason.status === 401) {
          onUnauthorized();
        }
        setPreviewError(reason instanceof Error ? reason.message : "读取作品失败");
      } finally {
        if (previewRequest.current === request) setPreviewLoading(false);
      }
    },
    [artifacts, onUnauthorized],
  );

  return (
    <>
      <div>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <input
            id={controlId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`搜索${field.label}`}
            aria-required={field.required}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            placeholder={`搜索${field.label}`}
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15"
          />
        </div>

        {selected ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-l-2 border-primary-400 bg-primary-50/60 px-3 py-2 text-sm">
            <Check className="h-4 w-4 shrink-0 text-primary-600" />
            <span className="min-w-0 flex-1 truncate font-medium text-ink-900">
              {selected.name}
            </span>
            <button
              type="button"
              onClick={() => void openPreview(selected.id)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary-700 hover:bg-primary-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              title="清除选择"
              aria-label={`清除已选作品 ${selected.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-primary-100 hover:text-ink-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="mt-2 max-h-64 overflow-y-auto border-y border-line">
          {loading ? (
            <div className="flex min-h-20 items-center gap-2 px-3 text-sm text-ink-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在加载作品
            </div>
          ) : loadError ? (
            <div className="flex min-h-20 flex-wrap items-center gap-2 px-3 py-3 text-sm text-rose-700">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={onRetry}
                className="font-medium underline underline-offset-2"
              >
                重试
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-400">
              {query.trim() ? "没有匹配的作品" : "还没有符合类型的作品"}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((artifact) => {
                const active = artifact.id === value;
                return (
                  <li key={artifact.id} className="flex min-w-0 items-center gap-2 px-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{artifact.name}</p>
                      <p className="mt-0.5 text-xs text-ink-400">{KIND_LABELS[artifact.kind]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openPreview(artifact.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-ink-600 hover:bg-canvas"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      打开
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(artifact.id)}
                      aria-pressed={active}
                      className={`h-8 rounded-lg px-2.5 text-xs font-medium transition ${
                        active
                          ? "bg-primary-100 text-primary-700"
                          : "bg-ink-900 text-white hover:bg-ink-800"
                      }`}
                    >
                      {active ? "已选择" : "选择"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Modal
        open={previewOpen}
        onClose={closePreview}
        label={previewArtifact ? `预览 ${previewArtifact.name}` : "预览作品"}
        size="workspace"
      >
        <div className="flex h-[min(82dvh,760px)] min-h-80 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
              {previewArtifact?.name ?? "作品预览"}
            </p>
            <ModalCloseButton onClose={closePreview} />
          </header>
          <ArtifactPreview
            artifact={previewArtifact}
            content={previewContent}
            loading={previewLoading}
            error={previewError}
            onClose={closePreview}
            className="min-h-0 flex-1"
          />
        </div>
      </Modal>
    </>
  );
}
