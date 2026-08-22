"use client";

import type { ToolPart } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import { getToolPresentation } from "@/lib/studio/tool-presentation";
import { AlertCircle, Check, FileStack, LoaderCircle } from "lucide-react";

type ArtifactStatusProps = {
  toolName: string;
  state: ToolPart["state"];
  artifactName?: string;
  onOpenArtifact?: () => void;
};

function statusKind(state: ToolPart["state"]): "running" | "completed" | "failed" {
  if (state === "output-available") return "completed";
  if (state === "output-error" || state === "output-denied") return "failed";
  return "running";
}

export default function ArtifactStatus({
  toolName,
  state,
  artifactName,
  onOpenArtifact,
}: ArtifactStatusProps) {
  const presentation = getToolPresentation(toolName);
  const kind = statusKind(state);
  const Icon = kind === "completed" ? Check : kind === "failed" ? AlertCircle : LoaderCircle;
  const label = kind === "completed"
    ? presentation.completed
    : kind === "failed"
      ? presentation.failed
      : presentation.running;

  return (
    <div
      className="my-1 flex min-h-8 max-w-xl items-center gap-2 text-[13px] text-ink-600"
      role="status"
      aria-live={kind === "running" ? "polite" : undefined}
    >
      <span
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
          kind === "completed" && "bg-emerald-50 text-emerald-600",
          kind === "failed" && "bg-rose-50 text-rose-600",
          kind === "running" && "bg-canvas text-ink-500",
        )}
      >
        <Icon
          className={cn(
            "size-3.5",
            kind === "running" && "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden
        />
      </span>
      <span className="font-medium text-ink-800">{label}</span>
      {artifactName ? <span className="min-w-0 truncate text-ink-500">· {artifactName}</span> : null}
      {kind === "completed" && onOpenArtifact ? (
        <button
          type="button"
          onClick={onOpenArtifact}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
        >
          <FileStack className="size-3" aria-hidden />
          查看作品
        </button>
      ) : null}
    </div>
  );
}
