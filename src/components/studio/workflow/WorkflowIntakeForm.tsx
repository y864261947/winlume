"use client";

import { LoaderCircle, Play, RefreshCw } from "lucide-react";
import type { Artifact, Project } from "@/lib/agent/types";
import type { IntakeField } from "@/lib/agent/production-packs/contracts";
import type { WorkflowPackCatalogEntry } from "@/lib/studio/api";
import type { WorkflowIntakeDraft } from "@/lib/studio/workflow-intake";
import { WorkflowArtifactPicker } from "./WorkflowArtifactPicker";

export function workflowFieldControlId(packId: string, fieldId: string): string {
  return `workflow-intake-${packId}-${fieldId}`;
}

type WorkflowIntakeFormProps = {
  pack: WorkflowPackCatalogEntry;
  values: WorkflowIntakeDraft;
  errors: Record<string, string>;
  artifacts: Artifact[];
  artifactsLoading: boolean;
  artifactsError: string | null;
  projects: Project[];
  projectsLoading: boolean;
  projectsError: string | null;
  selectedProjectId: string;
  submitting: boolean;
  submitError: string | null;
  statusMessage: string | null;
  launchDisabledReason: string | null;
  onValueChange: (fieldId: string, value: string | string[]) => void;
  onProjectChange: (projectId: string) => void;
  onRetryArtifacts: () => void;
  onRetryProjects: () => void;
  onUnauthorized: () => void;
  onSubmit: () => void;
};

function describedBy(packId: string, field: IntakeField, hasError: boolean): string {
  const ids = [`workflow-intake-${packId}-${field.id}-description`];
  if (hasError) ids.push(`workflow-intake-${packId}-${field.id}-error`);
  return ids.join(" ");
}

export function WorkflowIntakeForm({
  pack,
  values,
  errors,
  artifacts,
  artifactsLoading,
  artifactsError,
  projects,
  projectsLoading,
  projectsError,
  selectedProjectId,
  submitting,
  submitError,
  statusMessage,
  launchDisabledReason,
  onValueChange,
  onProjectChange,
  onRetryArtifacts,
  onRetryProjects,
  onUnauthorized,
  onSubmit,
}: WorkflowIntakeFormProps) {
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-0"
    >
      <section className="border-b border-line py-6" aria-labelledby="workflow-project-heading">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-8">
          <div>
            <h2 id="workflow-project-heading" className="text-sm font-semibold text-ink-900">
              所属项目
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">可选。作品和会话会归入所选项目。</p>
          </div>
          <div>
            <select
              id={`workflow-intake-${pack.id}-project`}
              value={selectedProjectId}
              onChange={(event) => onProjectChange(event.target.value)}
              disabled={projectsLoading || Boolean(projectsError)}
              aria-describedby={projectsError ? `workflow-intake-${pack.id}-project-error` : undefined}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{projectsLoading ? "正在加载项目" : "不关联项目"}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            {projectsError ? (
              <p id={`workflow-intake-${pack.id}-project-error`} role="alert" className="mt-2 text-xs text-rose-700">
                {projectsError}
                <button type="button" onClick={onRetryProjects} className="ml-2 inline-flex items-center gap-1 font-medium underline underline-offset-2">
                  <RefreshCw className="h-3 w-3" />
                  重试
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {pack.intake.map((field) => {
        const controlId = workflowFieldControlId(pack.id, field.id);
        const descriptionId = `${controlId}-description`;
        const errorId = `${controlId}-error`;
        const error = errors[field.id];
        const fieldDescribedBy = describedBy(pack.id, field, Boolean(error));
        const rawValue = values[field.id];
        const stringValue = typeof rawValue === "string" || typeof rawValue === "number"
          ? String(rawValue)
          : "";

        return (
          <section key={field.id} className="border-b border-line py-6">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-8">
              <div>
                {field.type === "multi_select" ? (
                  <p className="text-sm font-semibold text-ink-900">{field.label}</p>
                ) : (
                  <label htmlFor={controlId} className="text-sm font-semibold text-ink-900">
                    {field.label}
                  </label>
                )}
                {field.required ? (
                  <span className="ml-2 text-[11px] font-medium text-rose-600">必填</span>
                ) : (
                  <span className="ml-2 text-[11px] text-ink-400">可选</span>
                )}
                <p id={descriptionId} className="mt-1 text-xs leading-5 text-ink-500">
                  {field.description}
                </p>
              </div>

              <div>
                {field.type === "text" || field.type === "url" || field.type === "number" ? (
                  <input
                    id={controlId}
                    type={field.type}
                    step={field.type === "number" ? "any" : undefined}
                    value={stringValue}
                    required={field.required}
                    aria-invalid={Boolean(error)}
                    aria-describedby={fieldDescribedBy}
                    onChange={(event) => onValueChange(field.id, event.target.value)}
                    className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15"
                  />
                ) : null}

                {field.type === "select" ? (
                  <select
                    id={controlId}
                    value={stringValue}
                    required={field.required}
                    aria-invalid={Boolean(error)}
                    aria-describedby={fieldDescribedBy}
                    onChange={(event) => onValueChange(field.id, event.target.value)}
                    className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15"
                  >
                    <option value="">请选择</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : null}

                {field.type === "multi_select" ? (
                  <fieldset
                    aria-required={field.required}
                    aria-invalid={Boolean(error)}
                    aria-describedby={fieldDescribedBy}
                    className="space-y-2"
                  >
                    <legend className="sr-only">{field.label}</legend>
                    {field.options.map((option, index) => {
                      const selected = Array.isArray(rawValue) && rawValue.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 text-sm text-ink-800 hover:border-primary-200 hover:bg-canvas"
                        >
                          <input
                            id={index === 0 ? controlId : `${controlId}-${option.value}`}
                            type="checkbox"
                            name={field.id}
                            value={option.value}
                            checked={selected}
                            aria-describedby={fieldDescribedBy}
                            onChange={(event) => {
                              const current = Array.isArray(rawValue)
                                ? rawValue.filter((item): item is string => typeof item === "string")
                                : [];
                              onValueChange(
                                field.id,
                                event.target.checked
                                  ? [...new Set([...current, option.value])]
                                  : current.filter((item) => item !== option.value),
                              );
                            }}
                            className="h-4 w-4 accent-primary-600"
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                ) : null}

                {field.type === "artifact" ? (
                  <WorkflowArtifactPicker
                    field={field}
                    value={stringValue}
                    artifacts={artifacts}
                    loading={artifactsLoading}
                    loadError={artifactsError}
                    controlId={controlId}
                    describedBy={fieldDescribedBy}
                    invalid={Boolean(error)}
                    onChange={(artifactId) => onValueChange(field.id, artifactId)}
                    onRetry={onRetryArtifacts}
                    onUnauthorized={onUnauthorized}
                  />
                ) : null}

                {error ? (
                  <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-rose-700">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}

      <div className="py-6">
        {statusMessage ? (
          <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            {statusMessage}
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {submitError}
          </p>
        ) : null}
        {launchDisabledReason ? (
          <p className="mb-3 text-sm text-amber-800">{launchDisabledReason}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || Boolean(launchDisabledReason)}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {submitting ? "正在创建会话" : "创建工作流会话"}
        </button>
      </div>
    </form>
  );
}
