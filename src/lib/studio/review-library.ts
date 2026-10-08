import type { StudioToolCategoryId } from "./tool-categories";

/** Editable role briefs executed by the existing authenticated agent. */
export const REVIEW_ROLES: ReadonlyArray<{ id: string; name: string; initial: string; category: StudioToolCategoryId; note: string; deliver: string; prompt: string }> = [
  { id: "designer", name: "电商视觉设计师", initial: "视", category: "visual-media", note: "统一产品外观、构图和视觉语言。", deliver: "产品主图 / 卖点图 / 场景图", prompt: "请作为电商视觉设计师协助我。先确认产品资料、使用平台和视觉方向，保持产品真实结构与颜色，再规划主图、卖点图和场景图。" },
  { id: "director", name: "短视频编导", initial: "影", category: "content-marketing", note: "从内容方向到镜头与字幕安排。", deliver: "选题 / 分镜 / 拍摄清单", prompt: "请作为短视频编导协助我。先确认目标受众、发布平台和视频时长，再整理选题、镜头节奏、旁白与拍摄清单。" },
  { id: "analyst", name: "经营分析师", initial: "数", category: "legal-finance", note: "核对数据口径，解释变化与风险。", deliver: "指标分析 / 管理层摘要", prompt: "请作为经营分析师协助我。先确认数据来源、统计口径和分析周期，再整理指标变化、证据与待核实问题，缺失数据不要推断。" },
  { id: "researcher", name: "研究助理", initial: "研", category: "data-research", note: "梳理观点与证据，标注来源和局限。", deliver: "资料归纳 / 研究摘要", prompt: "请作为研究助理协助我。先明确研究问题与材料范围，再梳理主题、观点和证据，保留来源，不虚构引文。" },
  { id: "engineer", name: "开发工程师", initial: "码", category: "development", note: "明确问题边界，逐步排查与验证。", deliver: "排查路径 / 测试用例", prompt: "请作为开发工程师协助我。先确认需求或异常的复现条件、运行环境和影响范围，再给出实现或排查路径及验证方案。" },
  { id: "legal", name: "合同审查助理", initial: "法", category: "legal-finance", note: "标注待核实条款，辅助专业复核。", deliver: "条款对照 / 风险清单", prompt: "请作为合同审查助理协助我。先确认合同类型和审查范围，再整理付款、验收、违约和保密条款，引用原文位置并标注需专业法务复核的问题。" },
];

export const REVIEW_STARTERS: ReadonlyArray<{ name: string; category: StudioToolCategoryId; summary: string; prompt: string; artwork: string }> = [
  { name: "短视频分镜", category: "visual-media", summary: "先定方向，再组织镜头、旁白与制作清单。", prompt: REVIEW_ROLES[1].prompt, artwork: "video" },
  { name: "合同条款梳理", category: "legal-finance", summary: "整理付款、验收与责任条款，留待专业复核。", prompt: REVIEW_ROLES[5].prompt, artwork: "legal" },
  { name: "经营数据分析", category: "legal-finance", summary: "核对口径，梳理变化与下一步行动。", prompt: REVIEW_ROLES[2].prompt, artwork: "finance" },
  { name: "代码问题排查", category: "development", summary: "从复现条件到排查路径与回归测试。", prompt: REVIEW_ROLES[4].prompt, artwork: "code" },
  { name: "文献与资料整理", category: "data-research", summary: "按主题整理观点、证据与来源。", prompt: REVIEW_ROLES[3].prompt, artwork: "research" },
  { name: "品牌内容排期", category: "content-marketing", summary: "安排选题、文案、素材与发布节奏。", prompt: "请帮助我制定一周品牌内容计划，先确认受众、渠道与目标，再整理发布日、选题、配图和行动提示。", artwork: "" },
  { name: "需求与验收清单", category: "product-rd", summary: "从用户流程拆分需求、优先级与验收标准。", prompt: "请帮助我梳理产品需求，先确认用户、目标与流程，再列出需求、优先级、异常场景和验收标准。", artwork: "" },
  { name: "会议行动清单", category: "office-admin", summary: "整理决策、责任人、截止日期与待确认事项。", prompt: "请把我提供的会议记录整理成决策和行动清单，包含负责人、截止日期和依赖，未明确的信息标为待确认。", artwork: "" },
  { name: "网站开发", category: "development", summary: "梳理页面结构、响应式布局与开发交付。", prompt: "请协助我规划和开发一个响应式网站，先确认业务目标和页面结构，再拆分实现与验收步骤。", artwork: "" },
];

export function libraryTaskHref(prompt: string, skillIds: string[] = []) {
  const params = new URLSearchParams();
  if (prompt) params.set("prompt", prompt);
  [...new Set(skillIds)].slice(0, 10).forEach(id => params.append("skill", id));
  return `/studio?${params.toString()}`;
}
