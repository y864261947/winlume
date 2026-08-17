/**
 * Public metadata for the standalone Studio tool catalog.
 *
 * Keep this separate from agent-function schemas: tool pages need stable,
 * serializable display data without exposing provider configuration.
 */
export type StudioToolId =
  | "background-removal"
  | "image-clarity"
  | "watermark-subtitle-removal"
  | "image-fusion"
  | "ecommerce-image-set";

export type StudioToolCapabilityId =
  | "image.background_removal"
  | "image.upscale"
  | "image.watermark_text_removal";

export type StudioToolParameter =
  | {
      id: string;
      type: "select";
      label: string;
      description: string;
      defaultValue?: string;
      options: readonly { value: string; label: string }[];
    }
  | {
      id: string;
      type: "checkbox";
      label: string;
      description: string;
      required?: boolean;
    };

export type StudioToolParams = Record<string, string | boolean>;

export const BACKGROUND_REMOVAL_SUBJECTS = [
  "product",
  "person",
  "garment",
  "hair",
  "general_hd",
] as const;

export type BackgroundRemovalSubject = (typeof BACKGROUND_REMOVAL_SUBJECTS)[number];

export function isBackgroundRemovalSubject(
  value: unknown,
): value is BackgroundRemovalSubject {
  return (
    typeof value === "string" &&
    BACKGROUND_REMOVAL_SUBJECTS.includes(value as BackgroundRemovalSubject)
  );
}

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
  /** Provider capability is absent for tools backed by the image-generation gateway. */
  capability?: StudioToolCapabilityId;
  agentToolName: string;
  name: string;
  category: "图片处理";
  summary: string;
  description: string;
  inputHint: string;
  outputHint: string;
  triggers: readonly string[];
  composerPrompt: string;
  actionLabel: string;
  runningLabel: string;
  input: {
    minImages: number;
    maxImages: number;
    prompt?: {
      label: string;
      description: string;
      placeholder: string;
      maxLength: number;
      required?: boolean;
    };
  };
  parameters: readonly StudioToolParameter[];
};

export const STUDIO_TOOLS: readonly StudioTool[] = [
  {
    id: "background-removal",
    capability: "image.background_removal",
    agentToolName: "remove_background",
    name: "AI 抠图与细分割",
    category: "图片处理",
    summary: "按主体类型去除背景，支持商品、人像、服装、头发与通用高清分割。",
    description:
      "选择图片主体类型，生成带透明背景的 PNG，可用于商品图、人物素材和后续合成。",
    inputHint: "支持 PNG、JPG、WebP，单张不超过 2 MB。",
    outputHint: "输出 PNG，透明背景。",
    triggers: [
      "抠图",
      "去背景",
      "透明背景",
      "人像抠图",
      "服装抠图",
      "头发抠图",
      "cutout",
      "rembg",
      "background removal",
    ],
    composerPrompt: "请对我提供的图片抠图，去掉背景并保留透明背景。",
    actionLabel: "开始抠图",
    runningLabel: "正在抠图",
    input: { minImages: 1, maxImages: 1 },
    parameters: [
      {
        id: "subject",
        type: "select",
        label: "分割主体",
        description: "按图片中的主要对象选择，可获得更匹配的边缘效果。",
        defaultValue: "product",
        options: [
          { value: "product", label: "商品" },
          { value: "person", label: "人像" },
          { value: "garment", label: "服装" },
          { value: "hair", label: "头发" },
          { value: "general_hd", label: "通用高清" },
        ],
      },
    ],
  },
  {
    id: "image-clarity",
    capability: "image.upscale",
    agentToolName: "upscale_image",
    name: "AI 变清晰",
    category: "图片处理",
    summary: "提升图片清晰度，输出适合展示与发布的高清版本。",
    description:
      "上传低清、压缩或放大后的图片，使用标准或生成式超分辨率生成更清晰的版本。",
    inputHint: "支持 PNG、JPG、WebP，单张不超过 2 MB。",
    outputHint: "输出高清图片，保留原始构图。",
    triggers: ["变清晰", "高清", "超分", "放大", "修复", "upscale", "super resolution"],
    composerPrompt: "请将我提供的图片变清晰，使用标准增强。",
    actionLabel: "开始变清晰",
    runningLabel: "正在变清晰",
    input: { minImages: 1, maxImages: 1 },
    parameters: [
      {
        id: "mode",
        type: "select",
        label: "增强方式",
        description: "标准模式更稳定；生成式模式会补充细节。",
        defaultValue: "standard",
        options: [
          { value: "standard", label: "标准清晰" },
          { value: "generative", label: "生成式增强" },
        ],
      },
    ],
  },
  {
    id: "watermark-subtitle-removal",
    capability: "image.watermark_text_removal",
    agentToolName: "remove_watermark_or_subtitles",
    name: "清理水印字幕",
    category: "图片处理",
    summary: "移除图片中的水印或画面底部字幕。",
    description:
      "仅用于你拥有或已获授权处理的图片。可分别清理水印与字幕，不作为任意物体擦除工具。",
    inputHint: "支持 PNG、JPG、WebP，单张不超过 2 MB。",
    outputHint: "输出已清理的图片。",
    triggers: ["水印", "字幕", "去水印", "去字幕", "清理字幕", "watermark", "subtitle"],
    composerPrompt: "请清理我提供图片中的水印或字幕。",
    actionLabel: "开始清理",
    runningLabel: "正在清理",
    input: { minImages: 1, maxImages: 1 },
    parameters: [
      {
        id: "target",
        type: "select",
        label: "清理对象",
        description: "根据图片中的内容选择相应模式。",
        defaultValue: "watermark",
        options: [
          { value: "watermark", label: "水印" },
          { value: "subtitles", label: "字幕" },
        ],
      },
      {
        id: "rightsConfirmed",
        type: "checkbox",
        label: "我确认拥有处理此图片及移除相关内容的必要权利",
        description: "必须确认后才能提交。",
        required: true,
      },
    ],
  },
  {
    id: "image-fusion",
    agentToolName: "fuse_images",
    name: "AI 融图",
    category: "图片处理",
    summary: "将两张参考图融合为一张连贯的新画面。",
    description:
      "第一张图决定构图与场景，第二张图提供主体或要融合的元素；用文字说明你希望保留和改变的内容。",
    inputHint: "选择两张 PNG、JPG 或 WebP 图片，单张不超过 2 MB。",
    outputHint: "结果生成完成后会保存在我的作品中。",
    triggers: ["融图", "合图", "图片融合", "图像融合", "合成图片", "image fusion"],
    composerPrompt: "请将我提供的两张图融合：第一张为构图和场景，第二张为要融入的主体。",
    actionLabel: "开始融图",
    runningLabel: "正在融图",
    input: {
      minImages: 2,
      maxImages: 2,
      prompt: {
        label: "融合说明",
        description: "说明图二要如何融入图一，并写明需要保留的主体、材质、文字或构图。",
        placeholder: "例如：保留图一的森林光线和构图，将图二的香水瓶置于画面中央，保持瓶身材质和标签细节。",
        maxLength: 1200,
        required: true,
      },
    },
    parameters: [
      {
        id: "size",
        type: "select",
        label: "画面比例",
        description: "输出比例会影响构图和生成成本。",
        defaultValue: "1024x1024",
        options: [
          { value: "1024x1024", label: "方图" },
          { value: "1536x1024", label: "横图" },
          { value: "1024x1536", label: "竖图" },
        ],
      },
    ],
  },
  {
    id: "ecommerce-image-set",
    agentToolName: "generate_ecommerce_image_set",
    name: "AI 电商套图",
    category: "图片处理",
    summary: "从商品图生成主图、场景图和细节图；可选爆款参考图提取风格方向。",
    description:
      "先生成商品抠图并规划镜头，再分别生成可独立使用的主图、场景图与细节图。参考图只用于构图、光影与氛围，不复制其中的文字或品牌素材。",
    inputHint: "先选商品图；可再选一张爆款参考图。支持 PNG、JPG、WebP，单张不超过 2 MB。",
    outputHint: "一次生成 3 张独立电商图片，完成后可逐张下载。",
    triggers: ["电商套图", "商品套图", "商品图", "主图", "场景图", "详情图", "ecommerce"],
    composerPrompt: "请用我提供的商品图生成电商主图、场景图和细节图。",
    actionLabel: "生成套图",
    runningLabel: "正在创建套图",
    input: {
      minImages: 1,
      maxImages: 2,
      prompt: {
        label: "商品与视觉说明",
        description: "可补充商品用途、目标人群、使用场景或不希望改变的细节。",
        placeholder: "例如：极简护肤品牌，面向 25-35 岁通勤人群，保持瓶身标签与玻璃材质。参考图仅借鉴光影和构图。",
        maxLength: 1200,
      },
    },
    parameters: [
      {
        id: "template",
        type: "select",
        label: "套图模板",
        description: "模板决定主图、场景图和细节图的拍摄方向。",
        defaultValue: "product",
        options: [
          { value: "product", label: "通用商品" },
          { value: "apparel", label: "服装配饰" },
        ],
      },
      {
        id: "size",
        type: "select",
        label: "画面比例",
        description: "三个成品图会使用相同的输出比例。",
        defaultValue: "1024x1024",
        options: [
          { value: "1024x1024", label: "方图" },
          { value: "1536x1024", label: "横图" },
          { value: "1024x1536", label: "竖图" },
        ],
      },
    ],
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

export function initialStudioToolParams(tool: StudioTool): StudioToolParams {
  return Object.fromEntries(
    tool.parameters.map((field) => [
      field.id,
      field.type === "checkbox" ? false : (field.defaultValue ?? ""),
    ]),
  );
}

export function validateStudioToolParams(
  tool: StudioTool,
  raw: unknown,
): { params?: StudioToolParams; error?: string } {
  const supplied: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const params: StudioToolParams = {};

  for (const field of tool.parameters) {
    if (field.type === "checkbox") {
      const value = supplied[field.id] === true;
      if (field.required && !value) {
        return { error: `请确认：${field.label}` };
      }
      params[field.id] = value;
      continue;
    }

    const suppliedValue = supplied[field.id];
    const value = typeof suppliedValue === "string"
      ? suppliedValue.trim()
      : field.defaultValue ?? "";
    if (!field.options.some((option) => option.value === value)) {
      return { error: `请选择有效的${field.label}` };
    }
    params[field.id] = value;
  }

  return { params };
}
