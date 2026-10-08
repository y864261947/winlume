import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";
import { createFileRunStore } from "@/lib/agent/infrastructure/run-store";
import { summarizeStudioTasks } from "@/lib/studio/task-summary";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const root = process.env.REIZO_DATA_DIR ?? path.join(process.cwd(), "data");
  const [sessions, runs] = await Promise.all([
    webStore.sessions.listSessions(userId),
    createFileRunStore(path.join(root, "runs")).listRuns({ userId }),
  ]);
  return NextResponse.json({ tasks: summarizeStudioTasks(userId, sessions, runs) }, { headers: { "Cache-Control": "private, no-store" } });
}
