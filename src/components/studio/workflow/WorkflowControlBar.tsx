"use client";

import { useId, useState, type FormEvent } from "react";
import {
  Ban,
  CheckCircle2,
  CircleDot,
  CircleX,
  FileText,
  LoaderCircle,
  MessageSquareWarning,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  StepForward,
  X,
  type LucideIcon,
} from "lucide-react";
import Modal, { ModalCloseButton } from "@/components/Modal";
import type { ProductionWorkflowAction } from "@/lib/agent/production-packs/workflow-contract";
import type {
  WorkflowViewAction,
  WorkflowViewState,
} from "@/lib/studio/workflow-state";
import type { UseSessionWorkflowResult } from "./useSessionWorkflow";

type WorkflowControlBarProps = {
  workflow: UseSessionWorkflowResult;
  onOpenArtifact: (artifactId: string) => void;
  reconciling?: boolean;
  liveError?: string | null;
  onClearLiveError?: () => void;
};

type NoteDialog = "approve" | "request_changes";

const VIEW_ICONS: Record<WorkflowViewState["kind"], LucideIcon> = {
  ready: CircleDot,
  queued: LoaderCircle,
  running: LoaderCircle,
  approval: ShieldCheck,
  next: CheckCircle2,
  revision: MessageSquareWarning,
  completed: CheckCircle2,
  failed: CircleX,
  cancelled: Ban,
  loading: LoaderCircle,
  blocked: RefreshCw,
};

const ACTION_META: Record<
  WorkflowViewAction,
  { label: string; icon: LucideIcon }
> = {
  start: { label: "开始执行", icon: Play },
  stop: { label: "停止", icon: Square },
  approve: { label: "批准", icon: ShieldCheck },
  request_changes: { label: "要求修改", icon: MessageSquareWarning },
  start_next: { label: "下一阶段", icon: StepForward },
  retry_stage: { label: "重试阶段", icon: RotateCcw },
  open_output: { label: "查看成果", icon: FileText },
  refresh: { label: "刷新状态", icon: RefreshCw },
};

function WorkflowActionButton({
  action,
  variant,
  disabled,
  pending,
  onAction,
}: {
  action: WorkflowViewAction;
  variant: "primary" | "secondary";
  disabled: boolean;
  pending: boolean;
  onAction: (action: WorkflowViewAction) => void;
}) {
  const meta = ACTION_META[action];
  const Icon = pending ? LoaderCircle : meta.icon;
  return (
    <button
      type="button"
      onClick={() => onAction(action)}
      disabled={disabled}
      className={`inline-flex h-10 min-w-24 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none ${
        variant === "primary"
          ? "studio-send-btn text-white"
          : "studio-liquid-chip text-[#334155]"
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 ${pending ? "motion-safe:animate-spin" : ""}`}
      />
      {pending ? "处理中" : meta.label}
    </button>
  );
}

function pendingFor(
  action: WorkflowViewAction,
  pendingAction: ProductionWorkflowAction | null,
  refreshing: boolean,
): boolean {
  if (action === "refresh") return refreshing;
  return action === pendingAction;
}

export function WorkflowControlBar({
  workflow,
  onOpenArtifact,
  reconciling = false,
  liveError = null,
  onClearLiveError,
}: WorkflowControlBarProps) {
  const approvalNoteId = useId();
  const revisionNoteId = useId();
  const [dialog, setDialog] = useState<NoteDialog | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionAttempted, setRevisionAttempted] = useState(false);
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const projection = workflow.projection;
  const viewState = workflow.viewState;
  const ViewIcon = VIEW_ICONS[viewState.kind];
  const latestOutput = projection
    ? Object.values(projection.outputs).flat().at(-1)
    : undefined;
  const visibleError = workflow.actionError ?? workflow.error ?? liveError;
  const isSpinning =
    viewState.kind === "queued" ||
    viewState.kind === "running" ||
    viewState.kind === "loading" ||
    workflow.refreshing ||
    workflow.reconnecting ||
    reconciling;
  const actions = [
    ...(viewState.primaryAction ? [viewState.primaryAction] : []),
    ...viewState.secondaryActions,
  ];
  const disabled = workflow.pendingAction !== null || dialogSubmitting;

  const closeDialog = () => {
    if (dialogSubmitting) return;
    setDialog(null);
    setRevisionAttempted(false);
  };

  const openDialog = (next: NoteDialog) => {
    workflow.clearActionError();
    setRevisionAttempted(false);
    setDialog(next);
  };

  const runAction = (action: WorkflowViewAction) => {
    switch (action) {
      case "start":
        void workflow.start();
        return;
      case "stop":
        void workflow.stop();
        return;
      case "approve":
        openDialog("approve");
        return;
      case "request_changes":
        openDialog("request_changes");
        return;
      case "start_next":
        void workflow.startNext();
        return;
      case "retry_stage":
        void workflow.retryStage();
        return;
      case "open_output":
        if (latestOutput) onOpenArtifact(latestOutput.id);
        return;
      case "refresh":
        void workflow.refresh();
    }
  };

  const submitApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDialogSubmitting(true);
    try {
      if (await workflow.approve(approvalNote)) {
        setApprovalNote("");
        setDialog(null);
      }
    } finally {
      setDialogSubmitting(false);
    }
  };

  const submitRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = revisionNote.trim();
    setRevisionAttempted(true);
    if (!note) return;
    setDialogSubmitting(true);
    try {
      if (await workflow.requestChanges(note)) {
        setRevisionNote("");
        setRevisionAttempted(false);
        setDialog(null);
      }
    } finally {
      setDialogSubmitting(false);
    }
  };

  const clearVisibleError = () => {
    if (workflow.actionError) workflow.clearActionError();
    if (liveError) onClearLiveError?.();
    if (workflow.error) void workflow.refresh();
  };

  return (
    <div className="studio-composer-dock">
      {visibleError ? (
        <div
          role="alert"
          className="mx-auto mb-2 flex max-w-3xl items-start gap-2 rounded-lg bg-[#FFF1F2] px-3 py-2 text-xs text-[#9F1239]"
        >
          <CircleX aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 leading-5">{visibleError}</span>
          <button
            type="button"
            onClick={clearVisibleError}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-white/70"
            aria-label="关闭错误提示"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div
        className="studio-liquid-glass mx-auto flex w-full max-w-3xl flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:p-3"
        data-variant="session"
        aria-busy={isSpinning}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/65 text-[#334155]">
            <ViewIcon
              aria-hidden="true"
              className={`h-4 w-4 ${isSpinning ? "motion-safe:animate-spin" : ""}`}
            />
          </span>
          <div className="min-w-0 flex-1" aria-live="polite">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-xs font-semibold text-[#241E36]">
                {projection?.currentStage.title ?? projection?.pack.title ?? "专业工作流"}
              </p>
              {projection ? (
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#94A3B8]">
                  {projection.currentStage.index + 1}/{projection.currentStage.total}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-[#64748B]">
              {workflow.reconnecting
                ? "正在恢复连接"
                : reconciling
                  ? "正在同步运行结果"
                : workflow.refreshing
                  ? "正在同步状态"
                  : projection?.run?.error?.message ?? viewState.label}
            </p>
          </div>
        </div>

        {actions.length > 0 ? (
          <div className="flex w-full shrink-0 gap-2 sm:w-auto">
            {actions.map((action, index) => (
              <WorkflowActionButton
                key={action}
                action={action}
                variant={index === 0 ? "primary" : "secondary"}
                disabled={disabled}
                pending={pendingFor(
                  action,
                  workflow.pendingAction,
                  workflow.refreshing,
                )}
                onAction={runAction}
              />
            ))}
          </div>
        ) : null}
      </div>

      <Modal
        open={dialog === "approve"}
        onClose={closeDialog}
        label="批准当前阶段"
      >
        <form
          onSubmit={(event) => void submitApproval(event)}
          className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-xl"
        >
          <header className="flex h-12 items-center gap-3 border-b border-[#E2E8F0] px-4">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#047857]" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#241E36]">
              批准当前阶段
            </h2>
            <ModalCloseButton onClose={closeDialog} />
          </header>
          <div className="px-4 py-4">
            <label htmlFor={approvalNoteId} className="text-xs font-medium text-[#334155]">
              审核备注 <span className="font-normal text-[#94A3B8]">（可选）</span>
            </label>
            <textarea
              id={approvalNoteId}
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              maxLength={2000}
              rows={4}
              className="mt-2 w-full resize-y rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm leading-6 text-[#241E36] outline-none transition focus:border-[#64748B] focus:ring-2 focus:ring-[#0F172A]/10"
            />
          </div>
          <footer className="flex justify-end gap-2 border-t border-[#E2E8F0] px-4 py-3">
            <button
              type="button"
              onClick={closeDialog}
              disabled={dialogSubmitting}
              className="h-9 rounded-lg px-3 text-xs font-medium text-[#475569] transition hover:bg-[#F1F5F9] disabled:opacity-55"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={dialogSubmitting}
              className="studio-send-btn inline-flex h-9 min-w-20 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-55"
            >
              {dialogSubmitting ? (
                <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              )}
              批准
            </button>
          </footer>
        </form>
      </Modal>

      <Modal
        open={dialog === "request_changes"}
        onClose={closeDialog}
        label="要求修改当前阶段"
      >
        <form
          onSubmit={(event) => void submitRevision(event)}
          noValidate
          className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-xl"
        >
          <header className="flex h-12 items-center gap-3 border-b border-[#E2E8F0] px-4">
            <MessageSquareWarning aria-hidden="true" className="h-4 w-4 text-[#B45309]" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#241E36]">
              要求修改当前阶段
            </h2>
            <ModalCloseButton onClose={closeDialog} />
          </header>
          <div className="px-4 py-4">
            <label htmlFor={revisionNoteId} className="text-xs font-medium text-[#334155]">
              修改要求 <span className="text-[#BE123C]">*</span>
            </label>
            <textarea
              id={revisionNoteId}
              value={revisionNote}
              onChange={(event) => setRevisionNote(event.target.value)}
              maxLength={2000}
              rows={5}
              required
              aria-invalid={revisionAttempted && !revisionNote.trim()}
              aria-describedby={
                revisionAttempted && !revisionNote.trim()
                  ? `${revisionNoteId}-error`
                  : undefined
              }
              className={`mt-2 w-full resize-y rounded-lg border bg-white px-3 py-2 text-sm leading-6 text-[#241E36] outline-none transition focus:ring-2 ${
                revisionAttempted && !revisionNote.trim()
                  ? "border-[#FB7185] focus:border-[#E11D48] focus:ring-[#E11D48]/10"
                  : "border-[#CBD5E1] focus:border-[#64748B] focus:ring-[#0F172A]/10"
              }`}
            />
            {revisionAttempted && !revisionNote.trim() ? (
              <p id={`${revisionNoteId}-error`} className="mt-1.5 text-xs text-[#BE123C]">
                请填写需要修改的内容
              </p>
            ) : null}
          </div>
          <footer className="flex justify-end gap-2 border-t border-[#E2E8F0] px-4 py-3">
            <button
              type="button"
              onClick={closeDialog}
              disabled={dialogSubmitting}
              className="h-9 rounded-lg px-3 text-xs font-medium text-[#475569] transition hover:bg-[#F1F5F9] disabled:opacity-55"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={dialogSubmitting}
              className="studio-send-btn inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-55"
            >
              {dialogSubmitting ? (
                <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <MessageSquareWarning aria-hidden="true" className="h-4 w-4" />
              )}
              提交修改
            </button>
          </footer>
        </form>
      </Modal>
    </div>
  );
}
