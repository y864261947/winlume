"use client";

import { GitBranch, RefreshCw } from "lucide-react";
import type { WorkflowMessagePresentation } from "@/lib/agent/types";

export default function WorkflowRunNotice({
  presentation,
  messageId,
}: {
  presentation: WorkflowMessagePresentation;
  messageId: string;
}) {
  const isRetry = presentation.intent === "retry_start";
  const isRevision = presentation.intent === "revision_start";
  const detail = isRetry
    ? `第 ${presentation.iteration + 1} 次执行 · 重试`
    : isRevision
      ? `第 ${presentation.iteration + 1} 次执行 · 返工`
      : "阶段执行";
  const Icon = isRetry || isRevision ? RefreshCw : GitBranch;

  return (
    <div
      className="flex justify-center px-4 sm:px-6"
      data-message-id={messageId}
      role="status"
      aria-label={`已开始阶段：${presentation.stageTitle}，${detail}`}
    >
      <div className="inline-flex max-w-full items-center gap-2 rounded-[8px] border border-white/70 bg-white/55 px-3 py-2 text-xs text-[#615A73] shadow-[0_6px_18px_-14px_rgba(15,23,42,0.28)] backdrop-blur">
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" aria-hidden />
        <span className="min-w-0 truncate">
          已开始阶段：
          <strong className="font-medium text-[#241E36]">
            {presentation.stageTitle}
          </strong>
        </span>
        <span className="shrink-0 text-[11px] text-[#8A8298]">{detail}</span>
      </div>
    </div>
  );
}
