import { NextRequest, NextResponse } from "next/server";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
import { webStore } from "@/lib/host/web/store-singleton";
import { videoJobStore } from "@/lib/host/web/video-job-singleton";
import { canTransitionVideoJob } from "@/lib/host/web/video-job-store";
import {
  isVideoAnalysisStage,
  parseVideoAnalysisContent,
  serializeVideoAnalysisContent,
  type VideoAnalysisContent,
} from "@/lib/studio/video-analysis";
import { isTrustedMediaWorker } from "@/lib/studio/media-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };
type CallbackBody = {
  stage?: unknown;
  analysis?: unknown;
  error?: unknown;
};

export async function POST(request: NextRequest, context: Context) {
  if (!isTrustedMediaWorker(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { jobId } = await context.params;
  const job = await videoJobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Video job not found" }, { status: 404 });

  let body: CallbackBody;
  try {
    body = (await request.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isVideoAnalysisStage(body.stage)) {
    return NextResponse.json({ error: "Invalid analysis stage" }, { status: 400 });
  }
  if (!canTransitionVideoJob(job.stage, body.stage)) {
    return NextResponse.json({ error: "Invalid video job stage transition" }, { status: 409 });
  }
  if (body.stage === "ready" && body.analysis === undefined) {
    return NextResponse.json(
      { error: "Ready video analysis callbacks must include an analysis payload" },
      { status: 400 },
    );
  }

  const artifact = await webStore.artifacts.get(job.userId, job.analysisArtifactId);
  if (!artifact || artifact.kind !== "video-analysis") {
    return NextResponse.json({ error: "Analysis artifact not found" }, { status: 404 });
  }
  const existingRaw = await webStore.artifacts.readContent(job.userId, artifact.id);
  const existing = existingRaw ? parseVideoAnalysisContent(existingRaw.toString("utf8")) : null;
  if (!existing) return NextResponse.json({ error: "Analysis artifact is corrupt" }, { status: 409 });

  let next: VideoAnalysisContent = {
    ...existing,
    stage: body.stage,
    updatedAt: new Date().toISOString(),
  };
  if (body.analysis !== undefined) {
    const parsed = parseVideoAnalysisContent(body.analysis);
    if (
      !parsed ||
      parsed.jobId !== job.id ||
      parsed.sourceArtifactId !== job.sourceArtifactId ||
      parsed.goal !== job.goal
    ) {
      return NextResponse.json({ error: "Invalid analysis payload" }, { status: 400 });
    }
    next = { ...parsed, stage: body.stage, updatedAt: new Date().toISOString() };
  }
  const error = typeof body.error === "string" ? body.error.trim() : "";
  if (body.stage === "failed") {
    next = { ...next, error: error || "媒体分析失败" };
  } else if (next.error) {
    const { error: _error, ...withoutError } = next;
    next = withoutError;
  }

  const status = body.stage === "ready" ? "ready" : body.stage === "failed" ? "failed" : "pending";
  const updated = await webStore.artifacts.write(
    { ...artifact, status, ...(status === "failed" ? { error: next.error } : { error: undefined }) },
    serializeVideoAnalysisContent(next),
  );
  await videoJobStore.update(job.id, {
    stage: body.stage,
    error: body.stage === "failed" ? next.error ?? "媒体分析失败" : "",
  });
  publishArtifactEvent(job.userId, {
    type: "artifact_updated",
    artifactId: updated.id,
    status,
    ...(status === "failed" && updated.error ? { error: updated.error } : {}),
  });
  return NextResponse.json({ artifact: updated });
}
