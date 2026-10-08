import type { SkillMeta } from "@/lib/agent/types";
import { applicationCatalogSkillHref } from "./application-directory-skills";

/** Curated entry points; names and launch context come from enabled Skills. */
const groups = [
  { id: "marketing", title: "内容与营销", description: "从内容创作到品牌增长", icon: "send", roles: [
    ["marketing-social-media-strategist", "社媒运营助手", ["内容策划", "热点追踪", "品牌传播"]],
    ["marketing-china-ecommerce-operator", "电商运营助手", ["商品文案", "活动规划", "店铺优化"]],
    ["sales-coach", "销售助手", ["销售话术", "客户沟通", "成交策略"]],
  ] },
  { id: "product", title: "产品与研发", description: "从需求到交付的全流程支持", icon: "box", roles: [
    ["product-manager", "产品经理助手", ["需求分析", "产品规划", "竞品分析"]],
    ["engineering-frontend-developer", "开发助手", ["代码生成", "代码调试", "技术解答"]],
    ["testing-api-tester", "测试助手", ["测试用例", "接口测试", "质量验证"]],
  ] },
  { id: "legal", title: "法务与财务", description: "让专业工作更有条理", icon: "scale", roles: [
    ["legal-contract-reviewer", "法务助手", ["合同审查", "风险识别", "条款建议"]],
    ["finance-financial-analyst", "财务助手", ["财务分析", "报表解读", "经营洞察"]],
    ["finance-tax-strategist", "税务助手", ["税务研究", "资料整理", "方案分析"]],
  ] },
  { id: "creative", title: "视觉与媒体", description: "让每一个创意都有表达", icon: "video", roles: [
    ["design-image-prompt-engineer", "图片设计助手", ["创意构思", "提示词设计", "风格探索"]],
    ["marketing-short-video-editing-coach", "视频创作助手", ["视频脚本", "剪辑策划", "节奏优化"]],
    ["design-visual-storyteller", "视觉叙事助手", ["故事创作", "分镜设计", "视觉表达"]],
  ] },
  { id: "office", title: "管理与办公", description: "把时间留给更重要的工作", icon: "grid", roles: [
    ["specialized-meeting-assistant", "会议助手", ["会议纪要", "待办整理", "内容总结"]],
    ["support-executive-summary-generator", "汇报助手", ["管理简报", "重点提炼", "决策摘要"]],
    ["specialized-document-generator", "文档助手", ["文档生成", "格式排版", "报告制作"]],
  ] },
  { id: "research", title: "数据与科研", description: "从海量信息中发现价值", icon: "chart", roles: [
    ["support-analytics-reporter", "数据分析助手", ["数据分析", "图表呈现", "数据洞察"]],
    ["product-trend-researcher", "趋势研究助手", ["趋势追踪", "市场研究", "机会发现"]],
    ["academic-study-planner", "学习研究助手", ["学习规划", "知识梳理", "研究计划"]],
  ] },
] as const;

export function portalRoleGroups(skills: SkillMeta[]) {
  const available = new Map(skills.map((skill) => [skill.id, skill]));
  return groups.map((group) => ({
    id: group.id, title: group.title, description: group.description, icon: group.icon,
    roles: group.roles.flatMap(([id, label, tags]) => {
      const skill = available.get(id);
      return skill ? [{ id, label, tags: [...tags], href: applicationCatalogSkillHref(skill) }] : [];
    }),
  })).filter((group) => group.roles.length > 0);
}

export type PortalRoleGroup = ReturnType<typeof portalRoleGroups>[number];
