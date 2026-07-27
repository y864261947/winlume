export type AssessmentAnswers = {
  outcome: "sales_growth" | "service_quality" | "operations" | "clarity";
  owner: "sales" | "service" | "operations" | "leadership";
  workflow: "manual_follow_up" | "document_review" | "cross_team" | "unknown";
  data: "crm" | "knowledge_base" | "business_system" | "not_ready";
  maturity: "exploring" | "piloting" | "integrated" | "scaling";
  constraint: "data_quality" | "security" | "capacity" | "alignment";
  urgency: "this_month" | "this_quarter" | "this_year" | "research";
  delivery: "workflow" | "copilot" | "knowledge" | "roadmap";
};

export type AssessmentReport = {
  readiness: number;
  recommendedScenario: string;
  constraints: string[];
  requiredInputs: string[];
  phases: string[];
  recap: string[];
};

const readinessByMaturity = {
  exploring: 34,
  piloting: 52,
  integrated: 68,
  scaling: 82,
} satisfies Record<AssessmentAnswers["maturity"], number>;

const recommendationByOutcome = {
  sales_growth: "优先场景：线索转化工作流。先统一线索分级、自动生成下一步跟进建议，并让销售团队只处理高意向机会。",
  service_quality: "优先场景：服务响应助手。将高频咨询与工单分流到可追溯的知识检索和人工协同流程中。",
  operations: "优先场景：运营协同中枢。聚合跨团队状态、异常与待办，缩短从发现问题到执行闭环的时间。",
  clarity: "优先场景：AI 落地路线图。先盘点业务价值、数据基础和治理边界，再选择可验证的首个场景。",
} satisfies Record<AssessmentAnswers["outcome"], string>;

const constraintByType = {
  data_quality: "客户与线索数据需要先完成去重、字段规范和责任人校验。",
  security: "需要先明确数据分级、访问权限、审计记录和模型调用边界。",
  capacity: "需要为业务负责人预留每周评审时间，并明确交付团队的工程投入。",
  alignment: "需要先统一业务目标、成功指标和跨团队决策责任。",
} satisfies Record<AssessmentAnswers["constraint"], string>;

const dataInputByType = {
  crm: "可访问的 CRM 线索、客户、跟进记录和转化阶段定义。",
  knowledge_base: "已审核的知识库、内容负责人和内容更新流程。",
  business_system: "核心业务系统的只读数据样本、字段字典和接口责任人。",
  not_ready: "一份最小数据清单、数据负责人和可在试点期补齐的采集计划。",
} satisfies Record<AssessmentAnswers["data"], string>;

const workflowInputByType = {
  manual_follow_up: "当前人工跟进的触发条件、话术模板、升级规则和人工处理时长。",
  document_review: "典型文档样本、审核标准、例外处理方式和最终审批责任人。",
  cross_team: "跨团队交接节点、状态定义、阻塞原因和每个节点的业务负责人。",
  unknown: "一周的工作观察记录，用来识别重复步骤、等待时间和高价值决策点。",
} satisfies Record<AssessmentAnswers["workflow"], string>;

const outcomeMetricByType = {
  sales_growth: "基线与目标：有效线索率、首响时间、跟进覆盖率和转化率。",
  service_quality: "基线与目标：首响时间、一次解决率、升级率和客户满意度。",
  operations: "基线与目标：处理周期、异常闭环率、返工率和跨团队等待时间。",
  clarity: "基线与目标：首个场景的价值假设、试点范围和决策检查点。",
} satisfies Record<AssessmentAnswers["outcome"], string>;

const recapByAnswer = {
  outcome: {
    sales_growth: "业务目标：增长销售线索转化。",
    service_quality: "业务目标：提升服务质量。",
    operations: "业务目标：优化运营效率。",
    clarity: "业务目标：明确 AI 落地优先级。",
  },
  owner: {
    sales: "牵头团队：销售。",
    service: "牵头团队：客户服务。",
    operations: "牵头团队：运营。",
    leadership: "牵头团队：管理层。",
  },
  workflow: {
    manual_follow_up: "当前流程：人工跟进。",
    document_review: "当前流程：文档审核。",
    cross_team: "当前流程：跨团队协作。",
    unknown: "当前流程：仍待梳理。",
  },
  data: {
    crm: "数据基础：CRM 数据可用。",
    knowledge_base: "数据基础：知识库可用。",
    business_system: "数据基础：业务系统数据可用。",
    not_ready: "数据基础：需要先准备最小数据集。",
  },
  maturity: {
    exploring: "AI 成熟度：探索阶段。",
    piloting: "AI 成熟度：试点阶段。",
    integrated: "AI 成熟度：已开始集成。",
    scaling: "AI 成熟度：正在规模化。",
  },
  constraint: {
    data_quality: "主要约束：数据质量。",
    security: "主要约束：安全与合规。",
    capacity: "主要约束：交付资源。",
    alignment: "主要约束：目标对齐。",
  },
  urgency: {
    this_month: "预期节奏：本月启动。",
    this_quarter: "预期节奏：本季度启动。",
    this_year: "预期节奏：本年度推进。",
    research: "预期节奏：先行研究。",
  },
  delivery: {
    workflow: "交付偏好：端到端工作流。",
    copilot: "交付偏好：业务协同助手。",
    knowledge: "交付偏好：知识服务。",
    roadmap: "交付偏好：战略路线图。",
  },
} satisfies {
  [Key in keyof AssessmentAnswers]: Record<AssessmentAnswers[Key], string>;
};

const urgencyLabel = {
  this_month: "按本月启动的节奏",
  this_quarter: "按本季度启动的节奏",
  this_year: "按本年度推进的节奏",
  research: "按先行研究的节奏",
} satisfies Record<AssessmentAnswers["urgency"], string>;

const deliveryAction = {
  workflow: "完成一个可观测的端到端工作流试点",
  copilot: "上线一个受权限控制的业务协同助手",
  knowledge: "发布一个可追溯的知识检索服务",
  roadmap: "形成可执行的 AI 路线图和首个试点章程",
} satisfies Record<AssessmentAnswers["delivery"], string>;

export function buildAssessmentReport(answers: AssessmentAnswers): AssessmentReport {
  return {
    readiness: readinessByMaturity[answers.maturity],
    recommendedScenario: recommendationByOutcome[answers.outcome],
    constraints: [
      constraintByType[answers.constraint],
      answers.data === "not_ready"
        ? "在验证业务价值前，数据准备应作为试点的首个交付物。"
        : "试点范围应保持可控，并在每周评审中记录可复用的治理规则。",
    ],
    requiredInputs: [
      dataInputByType[answers.data],
      workflowInputByType[answers.workflow],
      outcomeMetricByType[answers.outcome],
    ],
    phases: [
      `0-30 天：${urgencyLabel[answers.urgency]}确认业务负责人、成功指标和最小数据范围。`,
      `31-60 天：用受控样本验证 ${recommendationByOutcome[answers.outcome].replace("优先场景：", "").split("。")[0]}，并处理 ${constraintByType[answers.constraint]}`,
      `61-90 天：${deliveryAction[answers.delivery]}，根据指标决定扩展、调整或停止。`,
    ],
    recap: [
      recapByAnswer.outcome[answers.outcome],
      recapByAnswer.owner[answers.owner],
      recapByAnswer.workflow[answers.workflow],
      recapByAnswer.data[answers.data],
      recapByAnswer.maturity[answers.maturity],
      recapByAnswer.constraint[answers.constraint],
      recapByAnswer.urgency[answers.urgency],
      recapByAnswer.delivery[answers.delivery],
    ],
  };
}
