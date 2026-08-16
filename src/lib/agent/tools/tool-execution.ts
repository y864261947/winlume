import { randomUUID } from "node:crypto";
import type { Artifact } from "@/lib/agent/types";
import type { ArtifactStore } from "@/lib/host/ports";
import {
  parseBackgroundRemovalSubject,
  type BackgroundRemovalSubject,
} from "@/lib/studio/background-removal";
import {
  isStudioToolImageMimeType,
  type StudioTool,
} from "@/lib/studio/tool-catalog";
import { ToolProviderError, type ToolInvocationResult } from "./providers/types";

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
    capability: "image.background_removal",
    input: {
      images: Array<{ bytes: Buffer; mimeType: string }>;
      params?: { subject?: BackgroundRemovalSubject };
    },
  ) => Promise<ToolInvocationResult>;
};

function outputName(source: Artifact): string {
  const base = source.name.replace(/\.[a-z0-9]{1,8}$/i, "").trim() || "商品图片";
  return `${base}（已抠图）.png`;
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
 * function calls. It never creates a Session or Workflow Run.
 */
export async function executeStudioTool(
  input: {
    tool: StudioTool;
    userId: string;
    sourceArtifactId: string;
    subject?: unknown;
  },
  dependencies: ExecuteStudioToolDependencies,
): Promise<Artifact> {
  if (input.tool.id !== "background-removal") {
    throw new StudioToolExecutionError("工具不存在", 404, "tool_not_found");
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
    const subject = parseBackgroundRemovalSubject(input.subject);
    invocation = await dependencies.invokeCapability("image.background_removal", {
      images: [{ bytes: sourceBytes, mimeType: source.mimeType }],
      ...(subject === "product" ? {} : { params: { subject } }),
    });
  } catch (error) {
    if (error instanceof ToolProviderError) throw providerFailure(error);
    throw new StudioToolExecutionError(
      "商品抠图服务暂时不可用，请稍后重试。",
      502,
      "tool_provider_unavailable",
    );
  }

  if (invocation.status !== "completed") {
    throw new StudioToolExecutionError(
      "商品抠图服务正在处理，请稍后重试。",
      503,
      "tool_processing_unsupported",
    );
  }
  const output = invocation.outputs[0];
  if (!output?.bytes.length || output.mimeType.toLowerCase() !== "image/png") {
    throw new StudioToolExecutionError(
      "商品抠图服务返回了无效图片。",
      422,
      "tool_invalid_result",
    );
  }

  return dependencies.artifacts.write(
    {
      id: randomUUID(),
      userId: input.userId,
      sessionId: source.sessionId,
      ...(source.projectId ? { projectId: source.projectId } : {}),
      name: outputName(source),
      kind: "image",
      mimeType: output.mimeType,
      storageKey: "",
      status: "ready",
      createdAt: new Date().toISOString(),
    },
    output.bytes,
  );
}
