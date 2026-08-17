import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  executeEcommerceImageSet,
  executeFuseImages,
} from "@/lib/agent/tools/execute";
import { executeStudioTool, StudioToolExecutionError } from "@/lib/agent/tools/tool-execution";
import { invokeToolCapability } from "@/lib/agent/tools/providers/registry";
import { webStore } from "@/lib/host/web/store-singleton";
import {
  getStudioTool,
  toolArtifactSessionId,
  validateStudioToolParams,
} from "@/lib/studio/tool-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ toolId: string }> };
type RunToolBody = {
  sourceArtifactId?: unknown;
  sourceArtifactIds?: unknown;
  referenceArtifactId?: unknown;
  prompt?: unknown;
  params?: unknown;
};

function fusionSourceArtifactIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const ids = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  return ids.every((id) => id.length > 0 && id.length <= 128) && new Set(ids).size === 2
    ? ids
    : null;
}

function singleSourceArtifactId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  return id && id.length <= 128 ? id : "";
}

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

  if (tool.id === "image-fusion") {
    const sourceArtifactIds = fusionSourceArtifactIds(body.sourceArtifactIds);
    if (!sourceArtifactIds) {
      return NextResponse.json({ error: "请选择两张不同的图片" }, { status: 400 });
    }
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 1_200) {
      return NextResponse.json({ error: "请填写不超过 1200 字的融合说明" }, { status: 400 });
    }
    const validated = validateStudioToolParams(tool, body.params);
    if (!validated.params || typeof validated.params.size !== "string") {
      return NextResponse.json({ error: validated.error ?? "工具参数无效" }, { status: 400 });
    }

    const result = await executeFuseImages(
      {
        name: tool.name,
        prompt,
        size: validated.params.size,
        sourceArtifactIds,
      },
      {
        userId,
        sessionId: toolArtifactSessionId(tool.id),
        artifacts: webStore.artifacts,
      },
    );
    if (!result.ok || !result.artifact) {
      return NextResponse.json({ error: result.summary }, { status: 400 });
    }
    return NextResponse.json({ artifact: result.artifact }, { status: 202 });
  }

  if (tool.id === "ecommerce-image-set") {
    const sourceArtifactId = singleSourceArtifactId(body.sourceArtifactId);
    if (!sourceArtifactId) {
      return NextResponse.json({ error: "请选择一张商品图片" }, { status: 400 });
    }
    const referenceArtifactId = body.referenceArtifactId === undefined
      ? undefined
      : singleSourceArtifactId(body.referenceArtifactId);
    if (body.referenceArtifactId !== undefined && !referenceArtifactId) {
      return NextResponse.json({ error: "请选择有效的爆款参考图" }, { status: 400 });
    }
    if (referenceArtifactId === sourceArtifactId) {
      return NextResponse.json({ error: "爆款参考图不能与商品图相同" }, { status: 400 });
    }
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length > 1_200) {
      return NextResponse.json({ error: "商品与视觉说明不能超过 1200 字" }, { status: 400 });
    }
    const validated = validateStudioToolParams(tool, body.params);
    if (
      !validated.params ||
      typeof validated.params.template !== "string" ||
      typeof validated.params.size !== "string"
    ) {
      return NextResponse.json({ error: validated.error ?? "工具参数无效" }, { status: 400 });
    }

    const result = await executeEcommerceImageSet(
      {
        name: tool.name,
        sourceArtifactId,
        ...(referenceArtifactId ? { referenceArtifactId } : {}),
        template: validated.params.template,
        prompt,
        size: validated.params.size,
      },
      {
        userId,
        sessionId: toolArtifactSessionId(tool.id),
        artifacts: webStore.artifacts,
        toolJobs: webStore.toolJobs,
      },
    );
    const artifacts = result.artifacts ?? [];
    if (!result.ok || !result.job || artifacts.length !== 3) {
      return NextResponse.json({ error: result.summary }, { status: 400 });
    }
    return NextResponse.json({ artifacts, job: result.job }, { status: 202 });
  }

  const sourceArtifactId = singleSourceArtifactId(body.sourceArtifactId);
  if (!sourceArtifactId) {
    return NextResponse.json({ error: "请选择一张图片" }, { status: 400 });
  }
  const validated = validateStudioToolParams(tool, body.params);
  if (!validated.params) {
    return NextResponse.json({ error: validated.error ?? "工具参数无效" }, { status: 400 });
  }

  try {
    const artifact = await executeStudioTool(
      { tool, userId, sourceArtifactId, params: validated.params },
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
      { error: "图片编辑服务暂时不可用，请稍后重试。", code: "tool_provider_unavailable" },
      { status: 502 },
    );
  }
}
