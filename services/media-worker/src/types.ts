import type { VideoAnalysisJob } from "../../../src/lib/studio/video-analysis";

export type MediaWorkerJob = Pick<
  VideoAnalysisJob,
  "id" | "userId" | "sourceArtifactId" | "analysisArtifactId" | "goal"
>;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseMediaWorkerJob(value: unknown): MediaWorkerJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    !nonEmptyString(input.id) ||
    !nonEmptyString(input.userId) ||
    !nonEmptyString(input.sourceArtifactId) ||
    !nonEmptyString(input.analysisArtifactId) ||
    (input.goal !== "script" && input.goal !== "storyboard" && input.goal !== "both")
  ) {
    return null;
  }
  return {
    id: input.id.trim(),
    userId: input.userId.trim(),
    sourceArtifactId: input.sourceArtifactId.trim(),
    analysisArtifactId: input.analysisArtifactId.trim(),
    goal: input.goal,
  };
}
