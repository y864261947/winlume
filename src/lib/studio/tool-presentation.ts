export type ToolPresentation = {
  label: string;
  running: string;
  completed: string;
  failed: string;
  result: boolean;
};

const TOOL_PRESENTATIONS: Record<string, ToolPresentation> = {
  todo_write: { label: "更新计划", running: "正在更新计划", completed: "计划已更新", failed: "计划更新失败", result: false },
  write_artifact: { label: "保存作品", running: "正在保存作品", completed: "已保存作品", failed: "保存作品失败", result: true },
  read_artifact: { label: "读取作品", running: "正在读取作品", completed: "已读取作品", failed: "读取作品失败", result: false },
  list_artifacts: { label: "查找作品", running: "正在查找作品", completed: "已找到作品", failed: "查找作品失败", result: false },
  generate_image: { label: "生成图片", running: "正在准备图片生成", completed: "图片生成任务已提交", failed: "图片生成失败", result: true },
  fuse_images: { label: "合成图片", running: "正在合成图片", completed: "图片合成任务已提交", failed: "图片合成失败", result: true },
  generate_ecommerce_image_set: { label: "生成电商素材", running: "正在准备电商素材", completed: "电商素材任务已提交", failed: "电商素材生成失败", result: true },
  remove_background: { label: "处理图片", running: "正在移除背景", completed: "背景处理已完成", failed: "背景处理失败", result: true },
  upscale_image: { label: "增强图片", running: "正在增强图片", completed: "图片增强已完成", failed: "图片增强失败", result: true },
  remove_watermark_or_subtitles: { label: "处理图片", running: "正在处理图片内容", completed: "图片处理已完成", failed: "图片处理失败", result: true },
  generate_canvas: { label: "生成画布", running: "正在生成画布", completed: "画布已生成", failed: "画布生成失败", result: true },
  generate_sheet: { label: "生成表格", running: "正在生成表格", completed: "表格已生成", failed: "表格生成失败", result: true },
};

const FALLBACK_PRESENTATION: ToolPresentation = {
  label: "执行操作",
  running: "正在执行操作",
  completed: "操作已完成",
  failed: "操作失败",
  result: false,
};

export function getToolPresentation(toolName: string): ToolPresentation {
  return TOOL_PRESENTATIONS[toolName] ?? FALLBACK_PRESENTATION;
}

export function isResultTool(toolName: string): boolean {
  return getToolPresentation(toolName).result;
}
