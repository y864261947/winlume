import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { webStore } from "@/lib/host/web/store-singleton";
import { videoJobStore } from "@/lib/host/web/video-job-singleton";
import { isTrustedMediaWorker } from "@/lib/studio/media-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };

/** Private, token-gated source stream for the media worker only. */
export async function GET(request: NextRequest, context: Context) {
  if (!isTrustedMediaWorker(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { jobId } = await context.params;
  const job = await videoJobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Video job not found" }, { status: 404 });

  const artifact = await webStore.artifacts.get(job.userId, job.sourceArtifactId);
  if (!artifact || artifact.kind !== "video") {
    return NextResponse.json({ error: "Source video not found" }, { status: 404 });
  }
  const stream = await webStore.artifacts.createReadStream(job.userId, artifact.id);
  const size = await webStore.artifacts.contentSize(job.userId, artifact.id);
  if (!stream || size === null) {
    return NextResponse.json({ error: "Source video bytes not found" }, { status: 404 });
  }

  return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
