/**
 * Reference-page content is kept separate from layout components so the
 * reconstruction can later be rebranded without changing its structure.
 */

export type EnterpriseMedia = {
  alt: string;
  fallback: string;
  src: string;
};

export type HeroCopy = {
  eyebrow: string;
  titleLead: string;
  titleAccent: string;
  deck: string;
  body: string;
  trustKicker: string;
  trustHighlight: string;
  primaryAction: string;
  secondaryAction: string;
  scrollHint: string;
};

export type PartnerMetric = {
  label: string;
  value: string;
};

export type Industry = {
  icon: "activity" | "factory" | "shopping-bag" | "shield-check" | "graduation-cap" | "plane";
  label: string;
};

export type PlatformCard = {
  description: string;
  index: string;
  name: string;
};

export type DeliveryCard = {
  features: readonly string[];
  index: string;
  title: string;
  type: string;
};

export type ProofPrinciple = {
  description: string;
  index: string;
  title: string;
};

export type EnterpriseCase = {
  category: string;
  href: string;
  metric: string;
  quote: string;
  role: string;
  summary: string;
  title: string;
};

export type VoiceScenario = {
  description: string;
  features: readonly string[];
  id: string;
  index: string;
  label: string;
  metric: string;
  metricDescription: string;
  transcript: readonly { speaker: "客户" | "AI"; text: string }[];
};

export type FaqEntry = {
  answer: string;
  id: string;
  question: string;
};

export type FooterContactLink = {
  href: string;
  label: string;
  type: "email" | "phone" | "text";
};

export const enterpriseMedia = {
  heroCanvas: {
    alt: "ZenAI system canvas",
    src: "/enterprise/zenai/hero-canvas.webp",
    fallback: "/enterprise/zenai/hero-canvas-fallback.webp",
  },
  voiceDemo: {
    alt: "Voice agent demonstration",
    src: "/enterprise/zenai/voice-demo.webp",
    fallback: "/enterprise/zenai/voice-demo-fallback.webp",
  },
} satisfies Record<string, EnterpriseMedia>;

export const heroCopy: HeroCopy = {
  eyebrow: "企业级 AI 集成 · ZENAI",
  titleLead: "无缝集成，而非推倒重来：",
  titleAccent: "为您的企业级系统注入 AI 动力",
  deck: "由硅谷工程团队领衔，在数周内将您的遗留系统转化为智能工作流。",
  body: "安全、合规，带来清晰可量化的投资回报率（ROI）。",
  trustKicker: "硅谷前沿标准 · 企业级 AI 资产",
  trustHighlight: "专为医疗、制造及汽车巨头等行业提供不同服务",
  primaryAction: "预约战略咨询",
  secondaryAction: "进行 AI 就绪度评估",
  scrollHint: "向下滚动，了解更多",
};

export const partnerCopy = {
  eyebrow: "值得信赖的工程伙伴",
  titlePrimary: "在真实行业里",
  titleSecondary: "把系统跑起来。",
  detail: "从前 Google 工程标准出发，服务受监管、高复杂度的垂直行业 —— 不是概念验证，而是可上线的生产系统。",
  metrics: [
    { value: "8+", label: "垂直行业深耕" },
    { value: "SOC2", label: "安全合规就绪" },
    { value: "24/7", label: "生产环境运维" },
  ],
  industries: [
    { label: "汽车", icon: "activity" },
    { label: "金融", icon: "factory" },
    { label: "物流", icon: "shopping-bag" },
    { label: "能源", icon: "shield-check" },
    { label: "房地产", icon: "graduation-cap" },
    { label: "通信", icon: "plane" },
  ],
} satisfies {
  detail: string;
  eyebrow: string;
  industries: readonly Industry[];
  metrics: readonly PartnerMetric[];
  titlePrimary: string;
  titleSecondary: string;
};

export const platformCopy = {
  eyebrow: "我们做什么",
  title: "从遗留系统到智能工作流，一站式工程落地。",
  groupLabel: "ZenAI 平台",
  cards: [
    { index: "Platform · 01", name: "ZenAI Pilot", description: "90 天聚焦一个高杠杆问题，完整解决并上线生产。" },
    { index: "Platform · 02", name: "ZenAI Fabric", description: "AI 架构层，将智能能力整合进整体企业系统。" },
    { index: "Platform · 03", name: "ZenAI Shield", description: "安全治理层，HIPAA / SOC 2 / GDPR 设计即内建。" },
  ],
} satisfies { cards: readonly PlatformCard[]; eyebrow: string; groupLabel: string; title: string };

export const deliveryCards = [
  {
    index: "01",
    type: "数字化转型",
    title: "数字化转型与系统现代化",
    features: [
      "将遗留 ERP/CRM 系统平滑升级为现代化微服务架构，零停机迁移，业务不中断。",
      "遗留系统无感迁移",
      "微服务架构重构",
      "数据孤岛打通",
      "实时业务监控大屏",
    ],
  },
  {
    index: "02",
    type: "定制 AI 集成",
    title: "定制 AI 集成与智能工作流",
    features: [
      "基于您现有业务数据训练专属 AI 模型，嵌入实际工作流，带来可量化的效率提升。",
      "Voice AI 语音智能体",
      "智能文档处理与合规审核",
      "预测性数据分析",
      "多语言跨境业务自动化",
    ],
  },
] satisfies readonly DeliveryCard[];

export const deliveryProof = {
  title: "交付证明",
  metrics: [
    { value: "90d", label: "Pilot 周期内从问题定义到生产上线" },
    { value: "0", label: "零停机迁移承诺（数字化转型块）" },
    { value: "SOC 2", label: "Shield 层合规框架设计即内建" },
  ],
  principles: [
    { index: "01 · SCOPE", title: "一个高杠杆问题，完整闭环，不做无限 PoC。", description: "" },
    { index: "02 · INTEGRATE", title: "嵌入现有 ERP / CRM / 工作流，而非旁路系统。", description: "" },
    { index: "03 · GOVERN", title: "安全与合规从架构层内建，而非事后补丁。", description: "" },
  ],
} satisfies {
  metrics: readonly PartnerMetric[];
  principles: readonly ProofPrinciple[];
  title: string;
};

export const caseSectionCopy = {
  eyebrow: "全球影响力",
  title: "跨越 AI 商业落地的最后一公里。",
  allCasesAction: "浏览全部成功案例",
  moreContentLabel: "+ 更多扩展内容 · 6",
};

export const logisticsCases = [
  {
    category: "物流与跨境贸易",
    title: "跨境贸易企业 AI 财务自动化与智能对账案例",
    summary: "ZenAI 为一家跨境贸易企业搭建 AI 财务自动化与智能对账中枢，帮助客户整合多平台收款流水、非标发票、报关单据和 ERP 数据，实现自动对账、票据解析、汇兑损益核算和财务流程自动化。",
    metric: "月度对账周期：约 7 天缩短至 1 天以内",
    quote: "过去每到月末，我们都要从多个平台导出流水，再逐笔核对订单、发票和 ERP 记录。ZenAI 将收款、票据和业务数据接入统一流程后，团队不再需要从零开始核对全部交易，而是把精力集中在异常项上。月度对账周期从约 7 天缩短到 1 天以内，管理层也能更及时看到不同平台和币种下的资金表现。",
    role: "中大型跨境贸易企业 · 财务负责人",
    href: "#cases",
  },
  {
    category: "物流与跨境贸易",
    title: "国际货代与跨境通关 AI 单证自动化案例",
    summary: "ZenAI 为一家国际货代与报关服务企业搭建 AI 清关单证自动化中枢，帮助客户解析提单、商业发票、装箱单和合规文件，自动完成跨单据校验、异常识别和报关草单生成。",
    metric: "复杂清关单证：40–60 分钟缩短至 2 分钟以内",
    quote: "过去，团队需要在提单、商业发票、装箱单和报关资料之间反复录入、核对和确认。ZenAI 将单证解析、跨单据校验和异常提示接入现有流程后，我们不再需要逐份文件从头比对，而是把时间集中在高风险和异常项上。复杂进口单证从解析到报关草单准备，典型流程已从 40–60 分钟缩短到 2 分钟以内。",
    role: "国际货运代理与跨境通关服务企业 · 报关运营负责人",
    href: "#cases",
  },
] satisfies readonly EnterpriseCase[];

export const voiceDemoCopy = {
  eyebrow: "业务案例",
  title: "部署听得懂、会思考、能成单的语音智能体。",
  scenarioLabel: "切换案例",
  audioHint: "试听真实外呼样本，感受语音节奏与结构化转写效果。",
  scenarios: [
    {
      id: "carbuki",
      index: "01",
      label: "Carbuki 汽车零售 · AI 智能体",
      description: "专为北美汽车零售场景深度调优。配置、部署并监控如人类般自然的语音引擎，以极低延迟打破传统 BDC 的转化瓶颈。",
      metric: "98%",
      metricDescription: "预约转化率",
      features: ["全天候智能客服，释放销售团队产能", "多轮对话理解，精准意图识别", "自动预约与日历同步", "客户情绪分析与实时转接"],
      transcript: [
        { speaker: "客户", text: "我上周买的车的保养套餐包含什么？" },
        { speaker: "AI", text: "您的保养套餐包含首年免费机油更换、轮胎轮换及 24 小时道路救援。需要我帮您预约首次保养吗？" },
        { speaker: "客户", text: "好的，下周三下午可以吗？" },
        { speaker: "AI", text: "已为您预约下周三下午 2 点。我会提前一天发送短信提醒。" },
      ],
    },
    {
      id: "logistics-erp",
      index: "02",
      label: "物流 ERP · AI 引擎",
      description: "将分散的订单、运输和库存信号接入同一业务语境，让调度、客服与运营在例外发生前就能协同处理。",
      metric: "24/7",
      metricDescription: "异常信号响应",
      features: ["多系统订单状态汇总", "异常节点自动提醒", "结构化工单生成", "关键客户优先分流"],
      transcript: [
        { speaker: "客户", text: "这票货为什么还没有更新状态？" },
        { speaker: "AI", text: "我已定位到港口拥堵造成的延迟，预计明天上午完成转运。我可以同步为您创建异常跟进单。" },
        { speaker: "客户", text: "请把最新安排发给收货方。" },
        { speaker: "AI", text: "已整理新的到货窗口并发送给收货联系人，同时标记给负责调度员。" },
      ],
    },
  ],
} satisfies { audioHint: string; eyebrow: string; scenarioLabel: string; scenarios: readonly VoiceScenario[]; title: string };

export const consultingGuideCopy = {
  eyebrow: "战略咨询",
  title: "AI 咨询导入指南 看清方向，再谈投入。",
  body: "三步问诊，找到你的 AI 破局切入点。完成评估后，您将获得一份专属诊断报告，包含行业基准对比与推荐行动方案。",
  steps: ["动态问诊", "生成报告", "预约咨询"],
  action: "进行 AI 就绪度评估",
};

export const faqCopy = {
  eyebrow: "FAQ",
  title: "常见问题",
  body: "给正在评估生产级 AI 合作的团队一个清晰入口。",
  entries: [
    {
      id: "timeline",
      question: "与 ZenAI 合作通常需要多长时间？",
      answer: "从首次沟通到系统正式投入生产，通常需要两到三个月。前一到两周用于业务诊断、系统审计与方案设计，构建、训练与集成阶段约需四到八周。",
    },
    {
      id: "platforms",
      question: "ZenAI Pilot、Fabric、Shield 三者有什么区别？",
      answer: "Pilot 是合作的第一阶段，我们会聚焦客户最具杠杆的一个问题，在 90 天内完整解决并投入生产。Fabric 是更广泛的 AI 架构层，将 AI 整合进客户的整体企业系统。Shield 则是安全治理层，HIPAA、SOC 2、GDPR 合规从设计阶段就已内建。",
    },
    {
      id: "difference",
      question: "ZenAI 与一般的 AI 咨询公司有什么不同？",
      answer: "我们不交付永远停留在 PPT 或概念验证阶段的成果。每一次 Pilot 都聚焦一个具体问题，完整解决并部署到生产环境，并附带可量化的业务指标。同时我们会从底层工程架构开始构建，而多数咨询公司只在应用层工作。",
    },
    {
      id: "pricing",
      question: "与 ZenAI 合作的费用是多少？",
      answer: "由于每个系统都针对客户的具体技术栈与目标量身设计，我们不提供标准化报价。我们采用透明的里程碑式计费结构，客户清楚每个阶段交付什么、为什么付费。具体预算建议通过一次战略沟通来评估。",
    },
    {
      id: "start",
      question: "如何开始合作？",
      answer: "第一步是与我们的工程团队进行一次 1 对 1 战略沟通，没有推销，只是围绕您的实际情况展开的对话。您可以通过官网的「预约演示」按钮直接预约，或发送邮件至 contact@zenaicorp.com。",
    },
  ],
} satisfies { body: string; entries: readonly FaqEntry[]; eyebrow: string; title: string };

export const footerCopy = {
  eyebrow: "准备转型？",
  title: "30 分钟，看清你的 AI 落地路径。",
  body: "免费技术评估，附专属诊断报告。\n从遗留系统到智能工作流——我们交付真正运行于您业务中的 AI。\n安全、合规，为企业级规模而生。",
  action: "预约战略咨询",
  location: "San Francisco, CA",
  contactLinks: [
    { label: "(650) 977-8536", href: "tel:+16509778536", type: "phone" },
    { label: "contact@zenaicorp.com", href: "mailto:contact@zenaicorp.com", type: "email" },
    { label: "B2B · Enterprise AI · Tech", href: "#footer", type: "text" },
  ],
  copyright: "© 2026 ZenAI. All rights reserved.",
} satisfies {
  action: string;
  body: string;
  contactLinks: readonly FooterContactLink[];
  copyright: string;
  eyebrow: string;
  location: string;
  title: string;
};
