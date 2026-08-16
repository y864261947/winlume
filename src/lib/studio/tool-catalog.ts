/**
 * Public metadata for the standalone Studio tool catalog.
 *
 * Keep this separate from agent-function schemas: tool pages need stable,
 * serializable display data without exposing provider configuration.
 */
export type StudioToolId = "background-removal";

/** MIME types accepted by the image-tool contract, not the broader composer. */
export const STUDIO_TOOL_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type StudioToolImageMimeType = (typeof STUDIO_TOOL_IMAGE_MIME_TYPES)[number];

export function isStudioToolImageMimeType(
  mimeType: string,
): mimeType is StudioToolImageMimeType {
  return STUDIO_TOOL_IMAGE_MIME_TYPES.includes(
    mimeType.toLowerCase() as StudioToolImageMimeType,
  );
}

export type StudioTool = {
  id: StudioToolId;
  name: string;
  category: "图片处理";
  summary: string;
  description: string;
  inputHint: string;
  outputHint: string;
  triggers: readonly string[];
};

/** Provider-safe ceiling for the dedicated tool form (Aliyun Segment* APIs). */
export const MAX_STUDIO_TOOL_IMAGE_BYTES = 3 * 1024 * 1024;

export const STUDIO_TOOLS: readonly StudioTool[] = [
  {
    id: "background-removal",
    name: "智能抠图",
    category: "图片处理",
    summary: "去掉背景，保留商品、人像或服装主体。",
    description:
      "上传图片并选择主体类型，生成带透明背景的 PNG，可直接用于详情页、海报和素材合成。",
    inputHint: "支持 PNG、JPG、WebP，单张不超过 3 MB。可拖入或 Ctrl+V 粘贴。",
    outputHint: "输出 PNG，透明背景。",
    triggers: ["抠图", "去背景", "透明背景", "cutout", "rembg", "background"],
  },
] as const;

export function listStudioTools(): StudioTool[] {
  return [...STUDIO_TOOLS];
}

export function getStudioTool(toolId: string): StudioTool | null {
  return STUDIO_TOOLS.find((tool) => tool.id === toolId) ?? null;
}

export function toolArtifactSessionId(toolId: StudioToolId): string {
  return `tool:${toolId}`;
}
