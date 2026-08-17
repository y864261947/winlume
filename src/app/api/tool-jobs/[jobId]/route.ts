import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { reconcileEcommerceImageSetJob } from "@/lib/agent/tools/execute";
import { webStore } from "@/lib/host/web/store-singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };

function withoutUserId<T extends { userId: string }>(value: T): Omit<T, "userId"> {
  const copy = { ...value } as Record<string, unknown>;
  Reflect.deleteProperty(copy, "userId");
  return copy as Omit<T, "userId">;
}

/** Return one user-owned ToolJob without exposing the account id or provider secrets. */
export async function GET(_request: Request, context: Context) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await context.params;
  let job = await webStore.toolJobs.get(jobId);
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  job = await reconcileEcommerceImageSetJob(job.id, {
    artifacts: webStore.artifacts,
    toolJobs: webStore.toolJobs,
  });
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  return NextResponse.json({ job: withoutUserId(job) });
}
