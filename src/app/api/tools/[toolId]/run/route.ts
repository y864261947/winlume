import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { executeStudioTool, StudioToolExecutionError } from "@/lib/agent/tools/tool-execution";
import { invokeToolCapability } from "@/lib/agent/tools/providers/registry";
import { webStore } from "@/lib/host/web/store-singleton";
import { getStudioTool } from "@/lib/studio/tool-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ toolId: string }> };
type RunToolBody = { sourceArtifactId?: unknown };

export async function POST(request: NextRequest, context: Context) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { toolId } = await context.params;
  const tool = getStudioTool(toolId);
  if (!tool) return NextResponse.json({ error: "工具不存在" }, { status: 404 });

  let body: RunToolBody;
  try {
    body = (await request.json()) as RunToolBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const sourceArtifactId =
    typeof body.sourceArtifactId === "string" ? body.sourceArtifactId.trim() : "";
  if (!sourceArtifactId || sourceArtifactId.length > 128) {
    return NextResponse.json({ error: "请选择一张图片" }, { status: 400 });
  }

  try {
    const artifact = await executeStudioTool(
      { tool, userId, sourceArtifactId },
      { artifacts: webStore.artifacts, invokeCapability: invokeToolCapability },
    );
    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    if (error instanceof StudioToolExecutionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "商品抠图服务暂时不可用，请稍后重试。", code: "tool_provider_unavailable" },
      { status: 502 },
    );
  }
}
