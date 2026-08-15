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
};

export const STUDIO_TOOLS: readonly StudioTool[] = [
  {
    id: "background-removal",
    name: "商品抠图",
    category: "图片处理",
    summary: "去除商品图片背景，保留干净透明主体。",
    description:
      "上传商品主图或选择已有作品，生成带透明背景的 PNG，可直接用于详情页、海报和素材合成。",
    inputHint: "支持 PNG、JPG、WebP，单张不超过 2 MB。",
    outputHint: "输出 PNG，透明背景。",
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
