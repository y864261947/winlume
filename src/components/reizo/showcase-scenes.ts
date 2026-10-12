import deliverables from "./showcase-deliverables.json";

export type OutcomeKind = "image" | "gallery" | "video" | "sheet" | "document" | "slides" | "code" | "chart";
export type Deliverable = { href?: string; bytes?: number; body?: string; detail?: string; formula?: string; pages?: string[]; pageTitles?: string[]; sections?: string[][]; images?: { src: string; title: string }[]; headings?: string[]; rows?: string[][] };
export type Outcome = Deliverable & { name: string; type: string; kind: OutcomeKind; title: string; subtitle: string; paragraphs?: string[] };
export type ShowcaseScene = { id: string; label: string; title: string; prompt: string; steps: string[]; summary: string; files: Outcome[]; completedFileIndex?: number };

const scenes: ShowcaseScene[] = [
  { id: "design", label: "电商销售", title: "让一个系列，有同一种品牌语言。", prompt: "为春夏训练系列做一套上新视觉。包含商品主图、跑步场景和面料细节，保持统一的品牌风格。", steps: ["理解系列定位与产品资料", "统一光线、色彩与视觉方向", "整理全渠道上新素材"], summary: "从系列主视觉到商品细节，一套素材接着用。", files: [
    { name: "春夏系列视觉", type: "JPG", kind: "gallery", title: "Made to move.", subtitle: "春夏训练系列 / 品牌视觉" },
    { name: "商品上架清单.xlsx", type: "XLSX", kind: "sheet", title: "春夏系列 · 上架清单", subtitle: "6 个素材 · 3 个渠道", headings: ["素材", "应用位置", "规格", "状态"], rows: [["系列主视觉", "首页首屏", "1920 × 1080", "已完成"], ["商品平铺", "商品详情", "1200 × 1200", "已完成"], ["跑步场景", "社交媒体", "1080 × 1440", "已完成"], ["面料特写", "详情页", "1200 × 1600", "已完成"]] },
    { name: "品牌视觉规范.md", type: "MD", kind: "document", title: "春夏系列视觉规范", subtitle: "品牌资产 / 可继续编辑", paragraphs: ["以日常运动为叙事主线，捕捉真实的动作与自然光。", "主视觉采用海蓝与柔白。产品画面保留面料纹理，人物画面突出运动状态。", "主标题：Made to move.\n应用范围：商品详情、品牌首页、社交发布。"] },
  ] },
  { id: "video", label: "视觉媒体", title: "从一张产品图，到一支发布短片。", prompt: "用这张日常鞋履产品图做一支生活方式短片。先写创意脚本与分镜，再呈现自然光、慢节奏的视频成片。", steps: ["读取产品图与产品特征", "生成创意脚本与镜头分镜", "根据分镜输出视频成片"], summary: "从产品素材到脚本分镜，最后交付可播放的短片。", completedFileIndex: 2, files: [
    { name: "日常鞋履产品图.jpg", type: "JPG", kind: "image", title: "日常鞋履 · 产品素材", subtitle: "起始素材 / 自然光与鞋履细节" },
    { name: "脚本与分镜.md", type: "MD", kind: "document", title: "日常鞋履 · 脚本与分镜", subtitle: "创意脚本 / 三组镜头 / 字幕与节奏" },
    { name: "日常鞋履短片.mp4", type: "MP4", kind: "video", title: "Make room for everyday.", subtitle: "生活方式短片 / 点击播放" },
  ] },
  { id: "marketing", label: "内容营销", title: "把一个品牌故事，排成一周的内容。", prompt: "为生活方式品牌规划一周内容，区分社交平台和公众号。给我发布日历、文案和汇报方案。", steps: ["梳理受众与内容主题", "编排平台节奏与素材需求", "整理发布日历与成稿"], summary: "日历落到日期，文案落到平台，提案可以接着汇报。", files: [
    { name: "7天内容日历.xlsx", type: "XLSX", kind: "sheet", title: "一周内容发布日历", subtitle: "10 月 12–18 日 / 生活方式品牌", headings: ["日期", "平台", "内容主题", "形式"], rows: [["周一", "小红书", "把早晨留给自己", "图文"], ["周二", "公众号", "一件好物的诞生", "长文"], ["周三", "抖音", "30 秒日常仪式", "短片"], ["周四", "小红书", "用户的生活角落", "图集"], ["周五", "视频号", "周末慢一点", "短片"], ["周日", "公众号", "本周灵感回顾", "清单"]] },
    { name: "渠道文案.txt", type: "TXT", kind: "document", title: "把早晨，留给自己。", subtitle: "小红书 / 周一首发", paragraphs: ["不用赶着成为谁，先好好开始今天。\n一杯热饮，一束阳光，一件用得顺手的好物。", "我们把对生活的期待，放进每一个小小的细节里。", "互动话题：你的早晨，有什么固定的小仪式？"] },
    { name: "品牌内容提案.pptx", type: "PPTX", kind: "slides", title: "让品牌走进日常", subtitle: "一周内容策略提案", paragraphs: ["从产品表达，走向生活共鸣", "三个内容支柱：日常仪式、产品故事、用户共创", "以收藏、有效互动与内容完成率复盘"] },
  ] },
  { id: "website", label: "代码开发", title: "把品牌想法，变成可以打开的页面。", prompt: "做一个葡萄酒酒庄的品牌独立站。要有产地故事、酒款介绍和预约入口，支持手机浏览。", steps: ["梳理页面结构与品牌内容", "实现响应式页面与交互", "整理代码和交付说明"], summary: "预览页面、查看组件，交接时也有清晰的说明。", files: [
    { name: "酒庄网站预览", type: "WEB", kind: "code", title: "山野之间，时间酿造。", subtitle: "山麓酒庄 / 品牌独立站" },
    { name: "交付说明.md", type: "MD", kind: "document", title: "品牌网站 · 交付说明", subtitle: "响应式页面 / 前端示例", paragraphs: ["页面结构\n品牌首屏、产地故事、酒款列表、预约入口。", "移动端适配\n导航折叠、图片按容器缩放、表单按单列展示。", "上线前确认\n替换品牌资料、连接预约服务、核对隐私说明。"] },
    { name: "页面组件.tsx", type: "TSX", kind: "document", title: "WineCollection.tsx", subtitle: "组件结构预览", paragraphs: ['export function WineCollection({ wines }) {', '  return (\n    <section aria-label="精选酒款">\n      {wines.map(wine => (\n        <WineCard key={wine.id} wine={wine} />\n      ))}\n    </section>\n  );', '}'] },
  ] },
  { id: "legal", label: "法务财务", title: "合同里的关键，变成清楚的行动。", prompt: "检查这份供应商合同，整理付款条件、交付验收和违约条款。标记风险，并给出付款安排。", steps: ["提取条款、金额与付款节点", "核对验收条件与风险项", "输出审阅意见与付款计划"], summary: "批注说明问题，表格跟进付款。示例内容供专业人员复核。", files: [
    { name: "合同审阅意见.docx", type: "DOCX", kind: "document", title: "供应商合同审阅意见", subtitle: "采购合同 / 审阅示例", paragraphs: ["01 交付验收标准需明确\n第 6 条未约定量化验收指标，建议补充交付清单、测试标准及验收时限。", "02 尾款触发条件需补充\n将“交付后付款”明确为“书面验收通过后 10 个工作日内支付”。", "03 违约责任需对等\n建议补充延期交付的处理方式与责任上限。"] },
    { name: "付款计划.xlsx", type: "XLSX", kind: "sheet", title: "合同付款计划", subtitle: "合同总额 ¥480,000 · 示例数据", headings: ["付款节点", "比例", "金额", "触发条件"], rows: [["预付款", "30%", "¥144,000", "合同生效"], ["阶段款", "40%", "¥192,000", "阶段验收"], ["尾款", "30%", "¥144,000", "最终验收"], ["合计", "100%", "¥480,000", "待复核"]] },
    { name: "风险清单.md", type: "MD", kind: "document", title: "签署前，确认这三件事", subtitle: "待办清单 / 法务协同", paragraphs: ["□ 与业务负责人确认交付范围及验收标准。", "□ 与财务确认开票要求、付款周期及账户信息。", "□ 由专业人员复核责任条款，再推进签署。"] },
  ] },
  { id: "product", label: "产品研发", title: "从一个用户痛点，到一份产品提案。", prompt: "围绕染烫后护理做一个新品概念。整理用户需求、功能优先级，以及可用于评审的产品提案。", steps: ["归纳用户需求与使用情境", "拆解产品概念和优先级", "整理评审提案与需求文档"], summary: "概念有依据，需求有优先级，评审有可展示的方案。", files: [
    { name: "新品概念提案.pptx", type: "PPTX", kind: "slides", title: "修护，也可以很轻盈。", subtitle: "染烫后护理 / 新品概念提案", paragraphs: ["面向频繁染烫、重视发丝触感的用户", "核心概念：轻盈修护 × 日常易用", "先验证使用体验，再确定功能与表达"] },
    { name: "产品需求文档.md", type: "MD", kind: "document", title: "轻盈修护系列 · 产品需求", subtitle: "概念阶段 / 评审稿", paragraphs: ["目标用户\n染烫后发丝干涩，同时不希望护理产品增加厚重感。", "核心场景\n居家洗护后的快速护理，每周搭配一次深度护理。", "验证计划\n开展小样体验，记录顺滑度、蓬松感及使用便捷性。"] },
    { name: "需求优先级.xlsx", type: "XLSX", kind: "sheet", title: "需求与验证清单", subtitle: "概念 → 小样 → 体验验证", headings: ["需求", "优先级", "验证方式", "阶段"], rows: [["轻盈触感", "P0", "小样体验", "待验证"], ["使用便捷", "P0", "场景访谈", "进行中"], ["便携包装", "P1", "使用测试", "待验证"], ["香型偏好", "P2", "用户问卷", "已整理"]] },
  ] },
  { id: "office", label: "办公管理", title: "会议结束，下一步也已经清楚。", prompt: "把周会记录整理成会议纪要，提取负责人和截止时间，输出任务表和周报演示稿。", steps: ["提取会议结论与待办事项", "明确负责人和交付时间", "整理纪要、任务表与周报"], summary: "讨论留下结论，行动有负责人，周报可以直接继续编辑。", files: [
    { name: "周会纪要.docx", type: "DOCX", kind: "document", title: "产品与运营周会纪要", subtitle: "10 月 12 日 / 项目协作", paragraphs: ["会议结论\n本周优先完成新版引导页，内容团队同步准备发布素材。", "关键决策\n先向小范围用户开放体验，根据反馈调整引导文案。", "待确认事项\n周三前确认验收范围；周五收集首批反馈并安排复盘。"] },
    { name: "本周任务表.xlsx", type: "XLSX", kind: "sheet", title: "本周行动清单", subtitle: "4 项任务 / 3 位负责人", headings: ["任务", "负责人", "截止时间", "状态"], rows: [["完善引导页", "林悦", "周三", "进行中"], ["确认验收范围", "陈晨", "周三", "待确认"], ["准备发布素材", "周宁", "周四", "进行中"], ["收集用户反馈", "林悦", "周五", "待开始"]] },
    { name: "项目周报.pptx", type: "PPTX", kind: "slides", title: "把进展，讲清楚。", subtitle: "产品项目周报", paragraphs: ["本周完成：页面方案与发布节奏对齐", "当前重点：引导体验与小范围验证", "下周计划：汇总反馈，进入第二轮迭代"] },
  ] },
  { id: "research", label: "数据科研", title: "从一份数据，到讲得清的发现。", prompt: "分析各渠道的月度增长数据，做趋势图和对比表，再写一份包含方法与局限的研究摘要。", steps: ["清洗数据并核对统计口径", "比较渠道变化与增长趋势", "输出图表、数据表和摘要"], summary: "数据表保留依据，图表表达趋势，摘要说明发现与局限。", files: [
    { name: "渠道增长图表.svg", type: "图表", kind: "chart", title: "增长来自哪里？", subtitle: "1–6 月渠道趋势 / 示例数据" },
    { name: "渠道分析.xlsx", type: "XLSX", kind: "sheet", title: "渠道月度对比", subtitle: "统一口径：月度有效线索", headings: ["月份", "自然搜索", "内容渠道", "直接访问"], rows: [["1 月", "120", "80", "60"], ["2 月", "150", "110", "70"], ["3 月", "180", "100", "90"], ["4 月", "210", "160", "100"], ["5 月", "270", "190", "120"], ["6 月", "320", "230", "140"]] },
    { name: "研究摘要.md", type: "MD", kind: "document", title: "渠道增长分析摘要", subtitle: "方法 / 发现 / 局限", paragraphs: ["方法\n按月汇总有效线索，统一渠道分类，比较规模与趋势。", "发现\n自然搜索从 120 增至 320；内容渠道存在月间波动，但总体持续增长。", "局限\n此为示例数据，不代表真实业务表现。尚未纳入渠道成本与季节性因素。"] },
  ] },
];

export const showcaseScenes = scenes.map(scene => ({ ...scene, files: scene.files.map((file, index) => ({ ...file, ...(deliverables as Record<string, Deliverable>)[`${scene.id}-${index}`] })) }));
