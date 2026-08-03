import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
import { webStore } from "@/lib/host/web/store-singleton";
import { videoJobStore } from "@/lib/host/web/video-job-singleton";
import {
  parseVideoAnalysisContent,
  serializeVideoAnalysisContent,
} from "@/lib/studio/video-analysis";
import { dispatchVideoAnalysisJob } from "@/lib/studio/media-worker-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ artifactId: string }> };

/**
 * Re-dispatch a durable queued job after a worker was temporarily unavailable.
 * Terminal jobs deliberately require a new analysis request instead of letting
 * a stale callback overwrite a completed or failed result.
 */
export async function POST(request: NextRequest, context: Context) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { artifactId } = await context.params;
  if (!artifactId?.trim()) {
    return NextResponse.json({ error: "缺少视频拆解作品 ID" }, { status: 400 });
  }
  const artifact = await webStore.artifacts.get(userId, artifactId);
  if (!artifact || artifact.kind !== "video-analysis") {
    return NextResponse.json({ error: "视频拆解作品不存在" }, { status: 404 });
  }
  const existingBytes = await webStore.artifacts.readContent(userId, artifact.id);
  const existing = existingBytes
    ? parseVideoAnalysisContent(existingBytes.toString("utf8"))
    : null;
  if (!existing) {
    return NextResponse.json({ error: "视频拆解内容无效" }, { status: 409 });
  }
  if (existing.stage !== "queued") {
    return NextResponse.json(
      { error: "只有等待中的视频拆解可以重新派发" },
      { status: 409 },
    );
  }

  const job = await videoJobStore.get(existing.jobId);
  if (
    !job ||
    job.userId !== userId ||
    job.analysisArtifactId !== artifact.id ||
    job.sourceArtifactId !== existing.sourceArtifactId ||
    job.stage !== "queued"
  ) {
    return NextResponse.json({ error: "等待中的视频任务不可用" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: _error, ...withoutError } = existing;
  const queuedContent = {
    ...withoutError,
    stage: "queued" as const,
    updatedAt: now,
  };
  let persisted = await webStore.artifacts.write(
    { ...artifact, status: "pending", error: undefined },
    serializeVideoAnalysisContent(queuedContent),
  );
  await videoJobStore.update(job.id, { stage: "queued", error: "", updatedAt: now });

  const dispatch = await dispatchVideoAnalysisJob(job);
  if (!dispatch.dispatched && dispatch.error) {
    // A callback always advances the stored stage before its result is usable.
    // Re-read both records so a late accepted dispatch cannot be overwritten.
    const latestJob = await videoJobStore.get(job.id);
    const latestBytes = await webStore.artifacts.readContent(userId, artifact.id);
    const latest = latestBytes
      ? parseVideoAnalysisContent(latestBytes.toString("utf8"))
      : null;
    if (latestJob?.stage === "queued" && latest?.stage === "queued") {
      await videoJobStore.update(job.id, { error: dispatch.error });
      persisted = await webStore.artifacts.write(
        { ...artifact, status: "pending", error: undefined },
        serializeVideoAnalysisContent({
          ...latest,
          error: dispatch.error,
          updatedAt: new Date().toISOString(),
        }),
      );
    }
  }

  publishArtifactEvent(userId, {
    type: "artifact_updated",
    artifactId: persisted.id,
    status: "pending",
  });
  return NextResponse.json({ artifact: persisted }, { status: 202 });
}
