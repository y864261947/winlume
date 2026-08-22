import { randomUUID } from "node:crypto";
import type { Artifact } from "@/lib/agent/types";
import type { ArtifactStore } from "@/lib/host/ports";
import {
  isStudioToolImageMimeType,
  type StudioTool,
  type StudioToolParams,
} from "@/lib/studio/tool-catalog";
import {
  ToolProviderError,
  type ToolCapabilityId,
  type ToolInvocationResult,
} from "./providers/types";

export class StudioToolExecutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "StudioToolExecutionError";
  }
}

type ExecuteStudioToolDependencies = {
  artifacts: ArtifactStore;
  invokeCapability: (
    capability: ToolCapabilityId,
    input: {
      images: Array<{ bytes: Buffer; mimeType: string }>;
      params?: StudioToolParams;
    },
  ) => Promise<ToolInvocationResult>;
};

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function outputName(tool: StudioTool, source: Artifact, mimeType: string): string {
  const base = source.name.replace(/\.[a-z0-9]{1,8}$/i, "").trim() || "商品图片";
  const operation = {
    "background-removal": "已抠图",
    "image-clarity": "已变清晰",
    "watermark-subtitle-removal": "已清理",
    "image-fusion": "已融图",
    "ecommerce-image-set": "电商套图",
  }[tool.id];
  return `${base}（${operation}）.${extensionForMimeType(mimeType)}`;
}

function providerFailure(error: ToolProviderError): StudioToolExecutionError {
  if (error.kind === "configuration") {
    return new StudioToolExecutionError(error.message, 503, "tool_unavailable");
  }
  if (error.kind === "invalid_result") {
    return new StudioToolExecutionError(error.message, 422, "tool_invalid_result");
  }
  return new StudioToolExecutionError(error.message, 502, "tool_provider_unavailable");
}

/**
 * Shared deterministic executor for direct tool pages and future Composer
 * function calls. It never creates a Session or durable agent Run.
 */
export async function executeStudioTool(
  input: {
    tool: StudioTool;
    userId: string;
    sourceArtifactId: string;
    params?: StudioToolParams;
    output?: {
      sessionId: string;
      projectId?: string;
      messageId?: string;
      visibility?: "visible" | "hidden";
    };
  },
  dependencies: ExecuteStudioToolDependencies,
): Promise<Artifact> {
  if (!input.tool.capability) {
    throw new StudioToolExecutionError(
      `${input.tool.name}需要通过异步图片生成流程运行。`,
      400,
      "async_tool_required",
    );
  }

  const source = await dependencies.artifacts.get(input.userId, input.sourceArtifactId);
  if (!source) {
    throw new StudioToolExecutionError("图片作品不存在", 404, "source_not_found");
  }
  if (source.kind !== "image" || !isStudioToolImageMimeType(source.mimeType)) {
    throw new StudioToolExecutionError("请选择 PNG、JPG 或 WebP 图片作品", 400, "invalid_source");
  }
  const sourceBytes = await dependencies.artifacts.readContent(input.userId, source.id);
  if (!sourceBytes?.length) {
    throw new StudioToolExecutionError("图片内容尚未准备好", 409, "source_not_ready");
  }

  let invocation: ToolInvocationResult;
  try {
    invocation = await dependencies.invokeCapability(input.tool.capability, {
      images: [{ bytes: sourceBytes, mimeType: source.mimeType }],
      ...(input.params && Object.keys(input.params).length ? { params: input.params } : {}),
    });
  } catch (error) {
    if (error instanceof ToolProviderError) throw providerFailure(error);
    throw new StudioToolExecutionError(
      `${input.tool.name}服务暂时不可用，请稍后重试。`,
      502,
      "tool_provider_unavailable",
    );
  }

  if (invocation.status !== "completed") {
    throw new StudioToolExecutionError(
      `${input.tool.name}服务正在处理，请稍后重试。`,
      503,
      "tool_processing_unsupported",
    );
  }
  const output = invocation.outputs[0];
  if (!output?.bytes.length || !isStudioToolImageMimeType(output.mimeType)) {
    throw new StudioToolExecutionError(
      `${input.tool.name}服务返回了无效图片。`,
      422,
      "tool_invalid_result",
    );
  }

  return dependencies.artifacts.write(
    {
      id: randomUUID(),
      userId: input.userId,
      sessionId: input.output?.sessionId ?? source.sessionId,
      ...(input.output?.projectId
        ? { projectId: input.output.projectId }
        : source.projectId
          ? { projectId: source.projectId }
          : {}),
      ...(input.output?.messageId ? { messageId: input.output.messageId } : {}),
      name: outputName(input.tool, source, output.mimeType),
      kind: "image",
      mimeType: output.mimeType,
      storageKey: "",
      status: "ready",
      createdAt: new Date().toISOString(),
      ...(input.output?.visibility ? { visibility: input.output.visibility } : {}),
    },
    output.bytes,
  );
}
