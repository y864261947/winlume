"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  CircleX,
  Clock3,
  FileText,
  LoaderCircle,
  MessageSquareWarning,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Modal, { ModalCloseButton } from "@/components/Modal";
import type {
  ProductionWorkflowArtifactRef,
  ProductionWorkflowProjection,
  ProductionWorkflowStageStatus,
} from "@/lib/agent/production-packs/workflow-contract";

type WorkflowStageRailProps = {
  projection: ProductionWorkflowProjection | null;
  loading: boolean;
  onOpenArtifact: (artifactId: string) => void;
};

type Stage = ProductionWorkflowProjection["stages"][number];

type StatusMeta = {
  label: string;
  icon: LucideIcon;
  tone: string;
  spin?: boolean;
};

const STATUS_META: Record<ProductionWorkflowStageStatus, StatusMeta> = {
  ready: { label: "待开始", icon: CircleDot, tone: "text-[#475569]" },
  queued: { label: "等待执行", icon: Clock3, tone: "text-[#2563EB]" },
  running: {
    label: "执行中",
    icon: LoaderCircle,
    tone: "text-[#2563EB]",
    spin: true,
  },
  awaiting_approval: {
    label: "等待审核",
    icon: ShieldCheck,
    tone: "text-[#B45309]",
  },
  ready_for_next: {
    label: "阶段完成",
    icon: CheckCircle2,
    tone: "text-[#047857]",
  },
  needs_revision: {
    label: "需要修改",
    icon: MessageSquareWarning,
    tone: "text-[#B45309]",
  },
  completed: {
    label: "已完成",
    icon: CheckCircle2,
    tone: "text-[#047857]",
  },
  failed: { label: "执行失败", icon: CircleX, tone: "text-[#BE123C]" },
  cancelled: { label: "已停止", icon: Ban, tone: "text-[#64748B]" },
  upcoming: { label: "未开始", icon: Circle, tone: "text-[#94A3B8]" },
};

const REVIEW_LABELS = {
  pending: "等待审核",
  approved: "已批准",
  changes_requested: "已要求修改",
} as const;

function StageStatus({ status }: { status: ProductionWorkflowStageStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${meta.tone}`}>
      <Icon
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 ${
          meta.spin ? "motion-safe:animate-spin" : ""
        }`}
      />
      {meta.label}
    </span>
  );
}

function artifactButton(
  artifact: ProductionWorkflowArtifactRef,
  enabled: boolean,
  onOpenArtifact: (artifactId: string) => void,
) {
  if (!enabled) {
    return (
      <span
        key={artifact.id}
        className="inline-flex h-7 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-md bg-[#F1F5F9] px-2 text-[11px] text-[#94A3B8]"
      >
        <FileText aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="truncate">{artifact.name}</span>
      </span>
    );
  }

  return (
    <button
      key={artifact.id}
      type="button"
      onClick={() => onOpenArtifact(artifact.id)}
      className="inline-flex h-7 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-md bg-white/70 px-2 text-[11px] font-medium text-[#334155] transition hover:bg-white hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0F172A]/20"
      title={`打开作品：${artifact.name}`}
    >
      <FileText aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span className="truncate">{artifact.name}</span>
    </button>
  );
}

function StageOutputs({
  stage,
  currentIndex,
  onOpenArtifact,
}: {
  stage: Stage;
  currentIndex: number;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const artifacts = stage.outputs.flatMap((output) => output.artifacts);
  if (artifacts.length === 0) return null;
  const enabled = stage.status !== "upcoming" && stage.index <= currentIndex;

  return (
    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 md:flex-nowrap md:overflow-x-auto md:[scrollbar-width:none]">
      {artifacts.map((artifact) =>
        artifactButton(artifact, enabled, onOpenArtifact),
      )}
    </div>
  );
}

export function WorkflowStageRail({
  projection,
  loading,
  onOpenArtifact,
}: WorkflowStageRailProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentDesktopStageRef = useRef<HTMLLIElement>(null);
  const currentStage = projection?.stages.find(
    (stage) => stage.id === projection.currentStage.id,
  );
  const currentStageId = projection?.currentStage.id;

  useEffect(() => {
    if (!currentStageId) return;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      currentDesktopStageRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentStageId]);

  const openFromMobile = (artifactId: string) => {
    setMobileOpen(false);
    onOpenArtifact(artifactId);
  };

  return (
    <section
      aria-label="工作流阶段"
      className="shrink-0 border-b border-white/55 bg-white/38 backdrop-blur-md"
    >
      <div className="hidden h-[88px] items-center px-4 py-2 md:flex sm:px-6">
        <ol className="flex w-full min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:thin]">
          {projection ? (
            projection.stages.map((stage) => {
              const current = stage.id === projection.currentStage.id;
              return (
                <li
                  key={stage.id}
                  ref={current ? currentDesktopStageRef : undefined}
                  aria-current={current ? "step" : undefined}
                  className={`h-[72px] w-56 min-w-56 overflow-hidden border-l-2 px-3 py-1.5 ${
                    current
                      ? "border-[#0F172A] bg-white/55"
                      : stage.status === "upcoming"
                        ? "border-[#E2E8F0]"
                        : "border-[#CBD5E1]"
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 font-mono text-[10px] tabular-nums text-[#94A3B8]">
                      {String(stage.index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-semibold text-[#241E36]">
                          {stage.title}
                        </p>
                        <StageStatus status={stage.status} />
                      </div>
                    </div>
                  </div>
                  <StageOutputs
                    stage={stage}
                    currentIndex={projection.currentStage.index}
                    onOpenArtifact={onOpenArtifact}
                  />
                </li>
              );
            })
          ) : (
            <li className="flex h-[72px] w-56 min-w-56 items-center border-l-2 border-[#E2E8F0] px-3 text-xs text-[#94A3B8]">
              {loading ? "正在加载阶段" : "阶段状态暂不可用"}
            </li>
          )}
        </ol>
      </div>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        disabled={!projection}
        className="flex h-12 w-full items-center gap-3 px-4 text-left transition hover:bg-white/45 disabled:cursor-default md:hidden"
        aria-haspopup="dialog"
      >
        {currentStage ? (
          <>
            <span className="font-mono text-[10px] tabular-nums text-[#94A3B8]">
              {currentStage.index + 1}/{projection?.currentStage.total}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#241E36]">
              {currentStage.title}
            </span>
            <StageStatus status={currentStage.status} />
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#64748B]" />
          </>
        ) : (
          <span className="text-xs text-[#94A3B8]">
            {loading ? "正在加载阶段" : "阶段状态暂不可用"}
          </span>
        )}
      </button>

      <Modal
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        label="工作流阶段"
        align="top"
      >
        <div className="max-h-[78dvh] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-xl">
          <header className="flex h-12 items-center gap-3 border-b border-[#E2E8F0] px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#241E36]">
                {projection?.pack.title ?? "工作流阶段"}
              </p>
              {projection ? (
                <p className="text-[11px] text-[#64748B]">
                  {projection.currentStage.index + 1}/{projection.currentStage.total}
                </p>
              ) : null}
            </div>
            <ModalCloseButton onClose={() => setMobileOpen(false)} />
          </header>

          <div className="max-h-[calc(78dvh-3rem)] overflow-y-auto">
            <ol className="divide-y divide-[#E2E8F0]">
              {projection?.stages.map((stage) => {
                const current = stage.id === projection.currentStage.id;
                return (
                  <li
                    key={stage.id}
                    aria-current={current ? "step" : undefined}
                    className={`px-4 py-3 ${current ? "bg-[#F8FAFC]" : ""}`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] font-mono text-[10px] tabular-nums text-[#64748B]">
                        {stage.index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-[#241E36]">
                            {stage.title}
                          </p>
                          <StageStatus status={stage.status} />
                        </div>
                        {stage.summary ? (
                          <p className="mt-1 text-xs leading-5 text-[#64748B]">
                            {stage.summary}
                          </p>
                        ) : null}
                        <StageOutputs
                          stage={stage}
                          currentIndex={projection.currentStage.index}
                          onOpenArtifact={openFromMobile}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {projection?.review ? (
              <div className="border-t border-[#E2E8F0] px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#334155]">
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  {REVIEW_LABELS[projection.review.status]}
                </div>
                {projection.review.note ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-[#64748B]">
                    {projection.review.note}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Modal>
    </section>
  );
}
