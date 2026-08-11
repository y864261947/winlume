import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
import { webStore } from "@/lib/host/web/store-singleton";
import { videoJobStore } from "@/lib/host/web/video-job-singleton";
import {
  createPendingVideoAnalysis,
  isVideoAnalysisGoal,
  parseVideoAnalysisContent,
  serializeVideoAnalysisContent,
  type VideoAnalysisGoal,
  type VideoAnalysisJob,
} from "@/lib/studio/video-analysis";
import { dispatchVideoAnalysisJob } from "@/lib/studio/media-worker-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StartAnalysisBody = {
  sourceArtifactId?: unknown;
  goal?: unknown;
};

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: StartAnalysisBody;
  try {
    body = (await request.json()) as StartAnalysisBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const sourceArtifactId = typeof body.sourceArtifactId === "string"
    ? body.sourceArtifactId.trim()
    : "";
  const goal: VideoAnalysisGoal = isVideoAnalysisGoal(body.goal) ? body.goal : "both";
  if (!sourceArtifactId) {
    return NextResponse.json({ error: "sourceArtifactId is required" }, { status: 400 });
  }

  const source = await webStore.artifacts.get(userId, sourceArtifactId);
  if (!source) return NextResponse.json({ error: "Source video not found" }, { status: 404 });
  if (source.kind !== "video") {
    return NextResponse.json({ error: "Source artifact is not a video" }, { status: 400 });
  }

  const now = new Date();
  const jobId = randomUUID();
  const analysisArtifactId = randomUUID();
  const pending = createPendingVideoAnalysis({ sourceArtifactId, jobId, goal, now });
  const job: VideoAnalysisJob = {
    id: jobId,
    userId,
    sessionId: source.sessionId,
    ...(source.projectId ? { projectId: source.projectId } : {}),
    sourceArtifactId,
    analysisArtifactId,
    goal,
    stage: "queued",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    const artifact = await webStore.artifacts.write(
      {
        id: analysisArtifactId,
        userId,
        sessionId: source.sessionId,
        ...(source.projectId ? { projectId: source.projectId } : {}),
        name: `${source.name.replace(/\.[^.]+$/, "")} · 视频拆解`,
        kind: "video-analysis",
        mimeType: "application/vnd.reizo.video-analysis+json; charset=utf-8",
        storageKey: "",
        status: "pending",
        createdAt: now.toISOString(),
      },
      serializeVideoAnalysisContent(pending),
    );
    await videoJobStore.create(job);
    const dispatch = await dispatchVideoAnalysisJob(job);
    let persistedArtifact = artifact;
    // Keep the artifact pending when the worker is temporarily unavailable.
    // Re-read first: a lost HTTP response can still mean the worker accepted
    // and already advanced the job through its callback.
    if (!dispatch.dispatched && dispatch.error) {
      const latestJob = await videoJobStore.get(jobId);
      const latestBytes = await webStore.artifacts.readContent(userId, artifact.id);
      const latest = latestBytes
        ? parseVideoAnalysisContent(latestBytes.toString("utf8"))
        : null;
      if (latestJob?.stage === "queued" && latest?.stage === "queued") {
        await videoJobStore.update(jobId, { error: dispatch.error });
        persistedArtifact = await webStore.artifacts.write(
          artifact,
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
      artifactId: persistedArtifact.id,
      status: "pending",
    });
    return NextResponse.json(
      { artifact: persistedArtifact, job: await videoJobStore.get(jobId) },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create video analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
