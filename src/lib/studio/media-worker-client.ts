import type { VideoAnalysisJob } from "./video-analysis";
import { MEDIA_WORKER_AUTH_HEADER, mediaWorkerToken } from "./media-worker-auth";

export type MediaWorkerJobRequest = Pick<
  VideoAnalysisJob,
  "id" | "userId" | "sourceArtifactId" | "analysisArtifactId" | "goal"
>;

function workerUrl(): string | null {
  const raw = process.env.REIZO_MEDIA_WORKER_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Best-effort handoff only. Job state is already persisted before this call,
 * so an unavailable worker never loses the user-visible pending artifact.
 */
export async function dispatchVideoAnalysisJob(
  job: MediaWorkerJobRequest,
): Promise<{ dispatched: boolean; error?: string }> {
  const baseUrl = workerUrl();
  const token = mediaWorkerToken();
  if (!baseUrl || !token) {
    return { dispatched: false, error: "媒体分析服务尚未配置" };
  }
  try {
    const response = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEDIA_WORKER_AUTH_HEADER]: token,
      },
      body: JSON.stringify(job),
      cache: "no-store",
    });
    if (!response.ok) {
      return { dispatched: false, error: `媒体分析服务返回 ${response.status}` };
    }
    return { dispatched: true };
  } catch {
    return { dispatched: false, error: "无法连接媒体分析服务" };
  }
}
