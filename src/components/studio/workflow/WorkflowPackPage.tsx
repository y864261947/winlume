"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useModals } from "@/components/providers";
import type { Artifact, Project } from "@/lib/agent/types";
import {
  getWorkflowPack,
  launchWorkflowPack,
  listArtifacts,
  listProjects,
  StudioApiError,
  type WorkflowPackCatalogEntry,
} from "@/lib/studio/api";
import {
  initialWorkflowIntake,
  reconcileWorkflowIntake,
  validateWorkflowIntake,
  workflowDraftKey,
  type WorkflowIntakeDraft,
} from "@/lib/studio/workflow-intake";
import {
  WorkflowIntakeForm,
  workflowFieldControlId,
} from "./WorkflowIntakeForm";

type WorkflowPackPageProps = {
  packId: string;
  scene?: string;
  requestedProjectId?: string;
};

type LoadState<T> = {
  loading: boolean;
  value: T;
  error: string | null;
};

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function unavailableReason(pack: WorkflowPackCatalogEntry): string | null {
  if (pack.availability.available) return null;
  const reasons = pack.availability.requirements
    .filter((requirement) => requirement.availability !== "available")
    .map((requirement) => requirement.reason ?? `${requirement.id} 暂不可用`);
  return reasons.length > 0 ? reasons.join("；") : "当前工作流所需能力暂不可用";
}

export function WorkflowPackPage({
  packId,
  scene,
  requestedProjectId,
}: WorkflowPackPageProps) {
  const router = useRouter();
  const { openLogin } = useModals();
  const [packState, setPackState] = useState<LoadState<WorkflowPackCatalogEntry | null>>({
    loading: true,
    value: null,
    error: null,
  });
  const [artifactState, setArtifactState] = useState<LoadState<Artifact[]>>({
    loading: true,
    value: [],
    error: null,
  });
  const [projectState, setProjectState] = useState<LoadState<Project[]>>({
    loading: true,
    value: [],
    error: null,
  });
  const [draft, setDraft] = useState<WorkflowIntakeDraft>({});
  const [draftStorageKey, setDraftStorageKey] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const packRequest = useRef(0);
  const artifactRequest = useRef(0);
  const projectRequest = useRef(0);
  const pendingDraftOverride = useRef<{ key: string; values: WorkflowIntakeDraft } | null>(null);

  const onUnauthorized = useCallback(() => openLogin("login"), [openLogin]);

  const handleLoadError = useCallback(
    (reason: unknown, fallback: string) => {
      if (reason instanceof StudioApiError && reason.status === 401) onUnauthorized();
      return errorMessage(reason, fallback);
    },
    [onUnauthorized],
  );

  const loadPack = useCallback(async () => {
    const request = packRequest.current + 1;
    packRequest.current = request;
    setPackState((current) => ({ ...current, loading: true, error: null }));
    try {
      const pack = await getWorkflowPack(packId);
      if (packRequest.current !== request) return;
      setPackState({ loading: false, value: pack, error: null });
    } catch (reason: unknown) {
      if (packRequest.current !== request) return;
      setPackState((current) => ({
        loading: false,
        value: current.value,
        error: handleLoadError(reason, "加载工作流失败"),
      }));
    }
  }, [handleLoadError, packId]);

  const loadArtifacts = useCallback(async () => {
    const request = artifactRequest.current + 1;
    artifactRequest.current = request;
    setArtifactState((current) => ({ ...current, loading: true, error: null }));
    try {
      const artifacts = await listArtifacts();
      if (artifactRequest.current !== request) return;
      setArtifactState({ loading: false, value: artifacts, error: null });
    } catch (reason: unknown) {
      if (artifactRequest.current !== request) return;
      setArtifactState((current) => ({
        loading: false,
        value: current.value,
        error: handleLoadError(reason, "加载作品失败"),
      }));
    }
  }, [handleLoadError]);

  const loadProjects = useCallback(async () => {
    const request = projectRequest.current + 1;
    projectRequest.current = request;
    setProjectState((current) => ({ ...current, loading: true, error: null }));
    try {
      const projects = await listProjects();
      if (projectRequest.current !== request) return;
      setProjectState({ loading: false, value: projects, error: null });
    } catch (reason: unknown) {
      if (projectRequest.current !== request) return;
      setProjectState((current) => ({
        loading: false,
        value: current.value,
        error: handleLoadError(reason, "加载项目失败"),
      }));
    }
  }, [handleLoadError]);

  useEffect(() => {
    setPackState({ loading: true, value: null, error: null });
    setDraftStorageKey(null);
    void loadPack();
    return () => {
      packRequest.current += 1;
    };
  }, [loadPack]);

  useEffect(() => {
    void loadArtifacts();
    return () => {
      artifactRequest.current += 1;
    };
  }, [loadArtifacts]);

  useEffect(() => {
    void loadProjects();
    return () => {
      projectRequest.current += 1;
    };
  }, [loadProjects]);

  const pack = packState.value;

  useEffect(() => {
    if (!pack) return;
    const key = workflowDraftKey(pack.id, pack.version);
    let nextDraft = initialWorkflowIntake(pack.intake);
    const override = pendingDraftOverride.current;
    if (override?.key === key) {
      nextDraft = override.values;
      pendingDraftOverride.current = null;
    } else {
      try {
        const stored = window.sessionStorage.getItem(key);
        if (stored) {
          nextDraft = reconcileWorkflowIntake(pack.intake, pack.intake, JSON.parse(stored));
        }
      } catch {
        // Storage is an optional convenience; the in-memory draft remains authoritative.
      }
    }
    setDraft(nextDraft);
    setFieldErrors({});
    setDraftStorageKey(key);
  }, [pack]);

  useEffect(() => {
    if (!pack || draftStorageKey !== workflowDraftKey(pack.id, pack.version)) return;
    try {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // Keep editing in memory when storage is unavailable or full.
    }
  }, [draft, draftStorageKey, pack]);

  useEffect(() => {
    if (projectState.loading || projectState.error) return;
    setSelectedProjectId((current) => {
      if (current && projectState.value.some((project) => project.id === current)) return current;
      if (
        requestedProjectId &&
        projectState.value.some((project) => project.id === requestedProjectId)
      ) {
        return requestedProjectId;
      }
      return "";
    });
  }, [projectState.error, projectState.loading, projectState.value, requestedProjectId]);

  const backHref = useMemo(() => {
    return scene ? `/studio/skills?scene=${encodeURIComponent(scene)}` : "/studio/skills";
  }, [scene]);

  const setFieldValue = useCallback((fieldId: string, value: string | string[]) => {
    setDraft((current) => ({ ...current, [fieldId]: value }));
    setFieldErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
    setSubmitError(null);
  }, []);

  const reconcileVersionConflict = useCallback(
    async (currentPack: WorkflowPackCatalogEntry, currentDraft: WorkflowIntakeDraft) => {
      try {
        const nextPack = await getWorkflowPack(packId);
        const reconciled = reconcileWorkflowIntake(
          currentPack.intake,
          nextPack.intake,
          currentDraft,
        );
        const nextKey = workflowDraftKey(nextPack.id, nextPack.version);
        pendingDraftOverride.current = { key: nextKey, values: reconciled };
        setDraftStorageKey(null);
        setPackState({ loading: false, value: nextPack, error: null });
        setFieldErrors({});
        setStatusMessage("工作流版本已更新，已保留兼容输入。请重新确认后再次创建会话。");
      } catch (reason: unknown) {
        setSubmitError(handleLoadError(reason, "工作流版本已变化，但刷新配置失败"));
      }
    },
    [handleLoadError, packId],
  );

  const submit = useCallback(async () => {
    if (!pack || submitting) return;
    const currentKey = workflowDraftKey(pack.id, pack.version);
    if (draftStorageKey !== currentKey) return;
    const validation = validateWorkflowIntake(pack.intake, draft);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      const firstInvalid = pack.intake.find((field) => validation.errors[field.id]);
      if (firstInvalid) {
        window.requestAnimationFrame(() => {
          document.getElementById(workflowFieldControlId(pack.id, firstInvalid.id))?.focus();
        });
      }
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setStatusMessage(null);
    try {
      const result = await launchWorkflowPack(pack.id, {
        version: pack.version,
        intake: validation.values,
        ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
      });
      try {
        window.sessionStorage.removeItem(currentKey);
      } catch {
        // Navigation still succeeds when storage is unavailable.
      }
      router.push(`/studio/c/${encodeURIComponent(result.session.id)}`);
    } catch (reason: unknown) {
      if (reason instanceof StudioApiError && reason.status === 401) onUnauthorized();
      if (reason instanceof StudioApiError && reason.code === "pack_version_unavailable") {
        await reconcileVersionConflict(pack, draft);
        return;
      }
      setSubmitError(errorMessage(reason, "创建工作流会话失败"));
    } finally {
      setSubmitting(false);
    }
  }, [
    draft,
    draftStorageKey,
    onUnauthorized,
    pack,
    reconcileVersionConflict,
    router,
    selectedProjectId,
    submitting,
  ]);

  if (packState.loading && !pack) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 bg-canvas px-5 text-sm text-ink-500">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        正在加载工作流配置
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-lg rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="h-5 w-5" />
          <h1 className="mt-3 text-base font-semibold">无法打开工作流</h1>
          <p className="mt-1 text-sm">{packState.error ?? "工作流不存在或暂不可用"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadPack()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-700 px-3 text-sm font-medium text-white">
              <RefreshCw className="h-4 w-4" />
              重试
            </button>
            <Link href={backHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-rose-800 hover:bg-rose-100">
              <ArrowLeft className="h-4 w-4" />
              返回工作流列表
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const launchDisabledReason = unavailableReason(pack);

  if (draftStorageKey !== workflowDraftKey(pack.id, pack.version)) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 bg-canvas px-5 text-sm text-ink-500">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        正在恢复工作流配置
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">
      <header className="border-b border-line bg-surface px-5 py-5 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeft className="h-4 w-4" />
            专业工作流
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-bold text-ink-950 sm:text-2xl">
                <BriefcaseBusiness className="h-5 w-5 shrink-0 text-primary-500" />
                {pack.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">{pack.summary}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-ink-400">
              <p>{pack.stages.length} 个阶段</p>
              <p className="mt-1 font-mono">v{pack.version}</p>
            </div>
          </div>
          {packState.error ? (
            <div role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span>{packState.error}</span>
              <button type="button" onClick={() => void loadPack()} className="ml-auto inline-flex items-center gap-1 font-medium underline underline-offset-2">
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 sm:px-8">
        <WorkflowIntakeForm
          pack={pack}
          values={draft}
          errors={fieldErrors}
          artifacts={artifactState.value}
          artifactsLoading={artifactState.loading}
          artifactsError={artifactState.error}
          projects={projectState.value}
          projectsLoading={projectState.loading}
          projectsError={projectState.error}
          selectedProjectId={selectedProjectId}
          submitting={submitting}
          submitError={submitError}
          statusMessage={statusMessage}
          launchDisabledReason={launchDisabledReason}
          onValueChange={setFieldValue}
          onProjectChange={setSelectedProjectId}
          onRetryArtifacts={() => void loadArtifacts()}
          onRetryProjects={() => void loadProjects()}
          onUnauthorized={onUnauthorized}
          onSubmit={() => void submit()}
        />
      </main>
    </div>
  );
}
