export type Pricing =
  | { kind: "token"; input: string; output: string }
  | { kind: "unit"; price: string }
  | { kind: "custom"; label: string };

export type ProductType = "模型" | "API" | "应用";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  type: ProductType;
  pricing: Pricing;
  tagline: string;
  description: string[];
  features: string[];
  isNew?: boolean;
}

export const products: Product[] = [
  // ── 语言大模型 ─────────────────────────────────────────────
  {
    id: "astral-4-pro",
    name: "astral-4-pro",
    brand: "星澜 Astral",
    category: "llm",
    type: "模型",
    pricing: { kind: "token", input: "$2", output: "$8" },
    tagline: "星澜旗舰推理模型，面向复杂 Agent 与长链路任务",
    description: [
      "astral-4-pro 是星澜系列的旗舰型号，针对多步推理、工具调用与长上下文场景做了专项优化，在复杂任务拆解上表现稳定。",
      "适合构建需要自主规划的 Agent 应用、代码生成与审阅、以及高要求的知识问答场景。",
    ],
    features: ["256K 上下文窗口", "原生工具调用与结构化输出", "多步推理稳定性增强", "支持流式响应"],
    isNew: true,
  },
  {
    id: "astral-4",
    name: "astral-4",
    brand: "星澜 Astral",
    category: "llm",
    type: "模型",
    pricing: { kind: "token", input: "$0.8", output: "$3" },
    tagline: "星澜系列均衡款，兼顾质量与成本的日常主力模型",
    description: [
      "astral-4 在保持旗舰级理解能力的同时大幅降低成本，是大多数对话与内容生成场景的性价比之选。",
      "响应速度快，适合在线客服、内容创作、摘要提取等高频调用场景。",
    ],
    features: ["128K 上下文窗口", "低延迟首 token", "中英文双语优化", "支持 JSON 模式"],
    isNew: true,
  },
  {
    id: "meridian-max",
    name: "meridian-max",
    brand: "子午线 Meridian",
    category: "llm",
    type: "模型",
    pricing: { kind: "token", input: "$3", output: "$12" },
    tagline: "子午线顶级型号，专注高难度分析与创作任务",
    description: [
      "meridian-max 是子午线系列的顶级型号，擅长长文写作、深度分析与专业领域问答。",
      "在法律、金融、医疗等专业知识密集场景中提供更可靠的输出质量。",
    ],
    features: ["200K 上下文窗口", "专业领域知识增强", "引用与事实一致性校验", "支持多轮深度对话"],
  },
  {
    id: "polaris-chat",
    name: "polaris-chat",
    brand: "北极星 Polaris",
    category: "llm",
    type: "模型",
    pricing: { kind: "token", input: "$0.3", output: "$1.2" },
    tagline: "北极星轻量对话模型，极速响应的低成本选择",
    description: [
      "polaris-chat 主打轻量与速度，适合高并发、低成本的在线对话场景。",
      "在常见问答、意图识别与简单写作任务上表现均衡。",
    ],
    features: ["32K 上下文窗口", "毫秒级首 token", "适合高并发场景", "极低的调用成本"],
  },
  {
    id: "bamboo-7b",
    name: "bamboo-7b",
    brand: "竹言 Bamboo",
    category: "llm",
    type: "模型",
    pricing: { kind: "token", input: "$0.1", output: "$0.4" },
    tagline: "竹言开源小钢炮，可私有化部署的轻量模型",
    description: [
      "bamboo-7b 是竹言团队开源的轻量级模型，权重开放，支持私有化部署。",
      "适合对数据隐私敏感、希望自主可控的团队作为基础模型使用。",
    ],
    features: ["开源权重", "支持私有化部署", "中英双语", "适合微调"],
  },
  {
    id: "tidal-r1",
    name: "tidal-r1",
    brand: "潮汐 Tidal",
    category: "llm",
    type: "模型",
    pricing: { kind: "token", input: "$1.5", output: "$6" },
    tagline: "潮汐深度思考模型，输出完整推理链路",
    description: [
      "tidal-r1 是潮汐系列的深度思考型号，会在回答前输出完整的推理过程，便于审阅与调试。",
      "在数学、逻辑与代码类任务上相比通用模型有显著提升。",
    ],
    features: ["显式思维链输出", "数理逻辑专项增强", "支持推理过程截断", "128K 上下文窗口"],
    isNew: true,
  },

  // ── 图片生成 ─────────────────────────────────────────────
  {
    id: "lumina-2-pro",
    name: "lumina-2-pro",
    brand: "流明绘 Lumina",
    category: "image-gen",
    type: "API",
    pricing: { kind: "unit", price: "$0.05/次" },
    tagline: "流明绘旗舰文生图模型，照片级画质与精准语义理解",
    description: [
      "lumina-2-pro 是流明绘系列的旗舰型号，支持照片级写实与多种艺术风格，对复杂提示词的还原度高。",
      "适合电商素材、营销视觉与创意概念图的批量生产。",
    ],
    features: ["最高 4K 输出", "中文提示词原生支持", "多种宽高比", "支持负面提示词"],
    isNew: true,
  },
  {
    id: "lumina-2",
    name: "lumina-2",
    brand: "流明绘 Lumina",
    category: "image-gen",
    type: "API",
    pricing: { kind: "unit", price: "$0.03/次" },
    tagline: "流明绘标准款，高质量与低成本兼得的文生图接口",
    description: [
      "lumina-2 在画质与成本之间取得平衡，适合内容平台的日常配图需求。",
      "生成速度快，支持批量并发调用。",
    ],
    features: ["最高 2K 输出", "秒级生成", "批量调用友好", "风格预设丰富"],
  },
  {
    id: "mirage-xl",
    name: "mirage-xl",
    brand: "幻景 Mirage",
    category: "image-gen",
    type: "API",
    pricing: { kind: "unit", price: "$0.06/次" },
    tagline: "幻景艺术向文生图模型，风格化表现力突出",
    description: [
      "mirage-xl 主打艺术风格化生成，在插画、概念艺术与风格迁移场景表现突出。",
      "内置数十种艺术家风格预设，可精确控制构图与光影。",
    ],
    features: ["艺术风格预设", "构图控制参数", "支持参考图", "最高 4K 输出"],
  },
  {
    id: "pixelwave-turbo",
    name: "pixelwave-turbo",
    brand: "像素波 PixelWave",
    category: "image-gen",
    type: "API",
    pricing: { kind: "unit", price: "$0.02/次" },
    tagline: "像素波极速文生图接口，亚秒级出图",
    description: [
      "pixelwave-turbo 专为实时场景优化，亚秒级返回结果。",
      "适合互动应用、实时头像与低延迟创意工具。",
    ],
    features: ["亚秒级出图", "实时场景优化", "低成本高频调用", "支持流式预览"],
  },

  // ── 图片处理 ─────────────────────────────────────────────
  {
    id: "clearcut-bg",
    name: "clearcut-bg",
    brand: "净剪 ClearCut",
    category: "image-edit",
    type: "API",
    pricing: { kind: "unit", price: "$0.008/次" },
    tagline: "净剪智能抠图接口，发丝级边缘处理",
    description: [
      "clearcut-bg 提供发丝级精度的背景移除能力，支持人像、商品与复杂场景。",
      "输出透明背景 PNG，可直接接入电商与设计的自动化流程。",
    ],
    features: ["发丝级边缘", "支持批量处理", "透明 PNG 输出", "人像/商品双模式"],
  },
  {
    id: "retouchly-hd",
    name: "retouchly-hd",
    brand: "润图坊 Retouchly",
    category: "image-edit",
    type: "API",
    pricing: { kind: "unit", price: "$0.015/次" },
    tagline: "润图坊高清修复，老照片与低清图一键焕新",
    description: [
      "retouchly-hd 针对老照片、压缩失真与低分辨率图片做智能修复。",
      "支持人脸增强、去噪、去模糊与色彩恢复。",
    ],
    features: ["人脸细节增强", "去噪去模糊", "色彩智能恢复", "最高放大 4 倍"],
  },
  {
    id: "mirage-inpaint",
    name: "mirage-inpaint",
    brand: "幻景 Mirage",
    category: "image-edit",
    type: "API",
    pricing: { kind: "unit", price: "$0.02/次" },
    tagline: "幻景局部重绘接口，涂抹即可改图",
    description: [
      "mirage-inpaint 支持通过蒙版对图片局部区域进行内容重绘。",
      "可用于去除杂物、替换元素与创意改造。",
    ],
    features: ["蒙版局部重绘", "内容感知填充", "多轮迭代编辑", "与 mirage-xl 风格一致"],
  },
  {
    id: "lumina-upscale",
    name: "lumina-upscale",
    brand: "流明绘 Lumina",
    category: "image-edit",
    type: "API",
    pricing: { kind: "unit", price: "$0.01/次" },
    tagline: "流明绘无损放大，最高 8 倍超分辨率",
    description: [
      "lumina-upscale 提供最高 8 倍的图像超分辨率放大。",
      "针对插画与照片分别优化，放大后细节自然。",
    ],
    features: ["最高 8 倍放大", "插画/照片双模型", "细节增强", "批量接口"],
  },

  // ── 视频生成 ─────────────────────────────────────────────
  {
    id: "motionry-3",
    name: "motionry-3",
    brand: "动影 Motionry",
    category: "video-gen",
    type: "API",
    pricing: { kind: "unit", price: "$0.35/次" },
    tagline: "动影第三代视频生成模型，运镜与物理一致性大幅提升",
    description: [
      "motionry-3 支持文生视频与图生视频，运镜自然，物理一致性显著改善。",
      "单次可生成最长 10 秒的 1080P 视频。",
    ],
    features: ["文生/图生视频", "最长 10 秒", "1080P 输出", "运镜控制参数"],
    isNew: true,
  },
  {
    id: "cineflow-pro",
    name: "cineflow-pro",
    brand: "流影 CineFlow",
    category: "video-gen",
    type: "API",
    pricing: { kind: "unit", price: "$0.5/次" },
    tagline: "流影电影级视频生成，叙事感与光影表现拉满",
    description: [
      "cineflow-pro 面向专业内容创作，电影级的光影与色彩表现。",
      "支持分镜脚本输入，一次生成多镜头序列。",
    ],
    features: ["电影级画质", "分镜脚本输入", "多镜头序列", "色彩风格预设"],
  },
  {
    id: "pixelwave-vid",
    name: "pixelwave-vid",
    brand: "像素波 PixelWave",
    category: "video-gen",
    type: "API",
    pricing: { kind: "unit", price: "$0.2/次" },
    tagline: "像素波轻量视频生成接口，低成本快速出片",
    description: [
      "pixelwave-vid 主打低成本快速视频生成，适合社交媒体的轻量内容。",
      "生成 5 秒 720P 视频，分钟级返回。",
    ],
    features: ["5 秒 720P", "分钟级返回", "低成本批量", "社交媒体尺寸预设"],
  },

  // ── 音视频处理 ─────────────────────────────────────────────
  {
    id: "sonique-tts-hd",
    name: "sonique-tts-hd",
    brand: "声屿 Sonique",
    category: "av",
    type: "API",
    pricing: { kind: "unit", price: "$25/百万字符" },
    tagline: "声屿高保真语音合成，情感与韵律接近真人",
    description: [
      "sonique-tts-hd 提供接近真人的语音合成能力，支持情感与语速控制。",
      "内置 30+ 音色，覆盖中英文主流场景。",
    ],
    features: ["30+ 内置音色", "情感与语速控制", "流式合成", "SSML 标记支持"],
  },
  {
    id: "sonique-clone",
    name: "sonique-clone",
    brand: "声屿 Sonique",
    category: "av",
    type: "API",
    pricing: { kind: "unit", price: "$0.05/次" },
    tagline: "声屿声纹克隆，10 秒样本复刻音色",
    description: [
      "sonique-clone 只需 10 秒音频样本即可复刻音色。",
      "适合有声内容、虚拟主播与个性化语音助手。",
    ],
    features: ["10 秒样本即可克隆", "跨语言合成", "情感迁移", "合规授权校验"],
  },
  {
    id: "voxelle-music-2",
    name: "voxelle-music-2",
    brand: "声格 Voxelle",
    category: "av",
    type: "API",
    pricing: { kind: "unit", price: "$0.12/次" },
    tagline: "声格旗舰音乐生成模型，支持人声与多轨编排",
    description: [
      "voxelle-music-2 支持带人声的完整歌曲生成与纯音乐编曲。",
      "可指定曲风、情绪、速度与人声性别。",
    ],
    features: ["带人声歌曲生成", "多轨编排", "曲风/情绪控制", "最长 3 分钟"],
    isNew: true,
  },
  {
    id: "voxelle-stt",
    name: "voxelle-stt",
    brand: "声格 Voxelle",
    category: "av",
    type: "API",
    pricing: { kind: "unit", price: "$0.006/分钟" },
    tagline: "声格语音转写，高准确率与说话人分离",
    description: [
      "voxelle-stt 提供高准确率的语音转文字服务，支持说话人分离与时间戳。",
      "覆盖 20+ 语言与常见方言场景。",
    ],
    features: ["说话人分离", "词级时间戳", "20+ 语言", "长音频异步接口"],
  },

  // ── 信息处理 ─────────────────────────────────────────────
  {
    id: "queryly-search",
    name: "queryly-search",
    brand: "询集 Queryly",
    category: "info",
    type: "API",
    pricing: { kind: "unit", price: "$0.004/次" },
    tagline: "询集联网搜索接口，为大模型提供实时信息",
    description: [
      "queryly-search 为大模型应用提供实时联网搜索能力，返回结构化摘要结果。",
      "支持新闻、网页与学术等多种检索源。",
    ],
    features: ["实时联网检索", "结构化摘要返回", "多检索源", "与大模型无缝衔接"],
  },
  {
    id: "doclens-parse",
    name: "doclens-parse",
    brand: "文镜 DocLens",
    category: "info",
    type: "API",
    pricing: { kind: "unit", price: "$0.002/页" },
    tagline: "文镜文档解析，PDF/扫描件结构化提取",
    description: [
      "doclens-parse 将 PDF、扫描件与图片中的文字、表格与版面结构提取为结构化数据。",
      "适合合同、财报与档案的自动化处理。",
    ],
    features: ["表格结构还原", "版面分析", "扫描件优化", "Markdown/JSON 输出"],
  },
  {
    id: "queryly-news",
    name: "queryly-news",
    brand: "询集 Queryly",
    category: "info",
    type: "API",
    pricing: { kind: "unit", price: "$0.003/次" },
    tagline: "询集资讯聚合接口，多源新闻一站式获取",
    description: [
      "queryly-news 聚合多来源新闻资讯，按主题与关键词订阅。",
      "支持去重、聚类与热度排序。",
    ],
    features: ["多源聚合", "智能去重", "话题聚类", "热度排序"],
  },
  {
    id: "doclens-ocr",
    name: "doclens-ocr",
    brand: "文镜 DocLens",
    category: "info",
    type: "API",
    pricing: { kind: "unit", price: "$0.001/次" },
    tagline: "文镜通用 OCR，印刷体与手写体识别",
    description: [
      "doclens-ocr 支持印刷体与手写体的通用文字识别。",
      "对票据、证件与表单场景做了专项优化。",
    ],
    features: ["印刷体/手写体", "票据证件优化", "多语言识别", "返回坐标信息"],
  },

  // ── RAG相关 ─────────────────────────────────────────────
  {
    id: "vectoris-embed-large",
    name: "vectoris-embed-large",
    brand: "向量司 Vectoris",
    category: "rag",
    type: "API",
    pricing: { kind: "token", input: "$0.15", output: "$0.15" },
    tagline: "向量司大尺寸嵌入模型，检索精度行业领先",
    description: [
      "vectoris-embed-large 输出 3072 维向量，在中英文混合检索上精度突出。",
      "适合企业知识库与语义搜索场景。",
    ],
    features: ["3072 维向量", "中英混合优化", "长文本切片建议", "批量嵌入接口"],
  },
  {
    id: "vectoris-rerank",
    name: "vectoris-rerank",
    brand: "向量司 Vectoris",
    category: "rag",
    type: "API",
    pricing: { kind: "token", input: "$0.08", output: "$0.08" },
    tagline: "向量司重排序模型，让检索结果更相关",
    description: [
      "vectoris-rerank 对初检结果做精排，显著提升 RAG 回答的相关性。",
      "与任意向量库与嵌入模型搭配使用。",
    ],
    features: ["精排相关度", "任意向量库兼容", "低延迟", "支持长文档"],
  },
  {
    id: "recallr-memory",
    name: "recallr-memory",
    brand: "忆库 Recallr",
    category: "rag",
    type: "API",
    pricing: { kind: "custom", label: "$0.5/百万 tokens" },
    tagline: "忆库长期记忆接口，为任意大模型增加记忆",
    description: [
      "recallr-memory 为大模型应用提供可插拔的长期记忆层。",
      "自动提取、存储与召回用户偏好和历史上下文。",
    ],
    features: ["记忆自动提取", "按用户隔离", "语义召回", "隐私可删除"],
    isNew: true,
  },

  // ── 工具API ─────────────────────────────────────────────
  {
    id: "lume-web-deploy",
    name: "lume-web-deploy",
    brand: "WinLume 自营",
    category: "tool-api",
    type: "API",
    pricing: { kind: "unit", price: "$0.001/次" },
    tagline: "网页一键部署接口，HTML 提交即得在线链接",
    description: [
      "lume-web-deploy 接收 HTML 内容并即刻返回可公开访问的在线链接。",
      "适合 AI 生成的落地页、原型稿的快速分享。",
    ],
    features: ["秒级上线", "自定义子域名", "自动 HTTPS", "7 天有效可续期"],
  },
  {
    id: "lume-prompt-opt",
    name: "lume-prompt-opt",
    brand: "WinLume 自营",
    category: "tool-api",
    type: "API",
    pricing: { kind: "custom", label: "按优化消耗的 token 计费" },
    tagline: "提示词优化接口，让任意模型的输出更稳定",
    description: [
      "lume-prompt-opt 对原始提示词做结构化改写与补全。",
      "支持针对指定目标模型的定向优化。",
    ],
    features: ["结构化改写", "目标模型定向优化", "效果对比报告", "批量优化"],
  },
  {
    id: "clearcut-idphoto",
    name: "clearcut-idphoto",
    brand: "净剪 ClearCut",
    category: "tool-api",
    type: "API",
    pricing: { kind: "unit", price: "$0.01/次" },
    tagline: "净剪证件照制作接口，多规格一键生成",
    description: [
      "clearcut-idphoto 将生活照转换为合规证件照。",
      "内置各国签证与常用证件规格，支持换底色。",
    ],
    features: ["多规格预设", "智能换底色", "合规检测", "批量生成"],
  },
  {
    id: "lume-link2img",
    name: "lume-link2img",
    brand: "WinLume 自营",
    category: "tool-api",
    type: "API",
    pricing: { kind: "unit", price: "$0.001/次" },
    tagline: "链接转图片接口，网页长截图即点即得",
    description: [
      "lume-link2img 将任意网页链接渲染为高清长截图。",
      "支持自定义视口、设备模拟与懒加载等待。",
    ],
    features: ["全页长截图", "设备模拟", "自定义视口", "PDF 输出可选"],
  },

  // ── 应用工具 ─────────────────────────────────────────────
  {
    id: "app-doc-assistant",
    name: "Lume 文档助手",
    brand: "WinLume 自营",
    category: "apps",
    type: "应用",
    pricing: { kind: "custom", label: "按实际调用模型计费" },
    tagline: "在线 AI 文档编辑器，写作、润色与翻译一体完成",
    description: [
      "Lume 文档助手是一款在线 AI 文档编辑器，支持智能续写、润色、翻译与摘要。",
      "可自由切换底层模型，按实际调用量计费，无订阅费。",
    ],
    features: ["智能续写与润色", "多模型自由切换", "团队协作空间", "导出 Markdown/Word"],
  },
  {
    id: "app-image-studio",
    name: "Lume 图像工坊",
    brand: "WinLume 自营",
    category: "apps",
    type: "应用",
    pricing: { kind: "custom", label: "按实际调用模型计费" },
    tagline: "一站式 AI 图像工作台，生成、编辑与放大全搞定",
    description: [
      "Lume 图像工坊聚合平台内的图像生成与处理能力，提供画布式交互。",
      "支持文生图、局部重绘、抠图与超分放大的一站式操作。",
    ],
    features: ["画布式交互", "生成与编辑一体", "历史版本管理", "批量导出"],
  },
  {
    id: "app-podcast",
    name: "Lume 播客工坊",
    brand: "WinLume 自营",
    category: "apps",
    type: "应用",
    pricing: { kind: "custom", label: "按实际调用模型计费" },
    tagline: "AI 播客制作工具，文稿一键变多人对谈节目",
    description: [
      "Lume 播客工坊将文稿或链接内容自动转换为多人对谈式播客音频。",
      "可自定义主播音色、语速与背景配乐。",
    ],
    features: ["文稿转对谈", "多音色主播", "背景音乐库", "一键发布 RSS"],
  },
  {
    id: "app-ppt",
    name: "Lume PPT 制作",
    brand: "WinLume 自营",
    category: "apps",
    type: "应用",
    pricing: { kind: "custom", label: "按实际调用模型计费" },
    tagline: "AI 演示文稿生成，大纲到成片只需几分钟",
    description: [
      "Lume PPT 制作根据大纲或文档自动生成设计精良的演示文稿。",
      "内置多套模板，支持在线编辑与导出 PPTX。",
    ],
    features: ["大纲生成成片", "多套设计模板", "在线编辑", "导出 PPTX"],
  },
  {
    id: "app-search-master",
    name: "Lume 搜索大师",
    brand: "WinLume 自营",
    category: "apps",
    type: "应用",
    pricing: { kind: "custom", label: "按实际调用模型计费" },
    tagline: "AI 深度搜索应用，自动整理带来源的研究报告",
    description: [
      "Lume 搜索大师针对研究型问题自动规划检索、阅读与整理。",
      "输出带来源引用的结构化研究报告。",
    ],
    features: ["多步深度检索", "来源引用", "报告导出", "追问式研究"],
  },
  {
    id: "app-video-translate",
    name: "Lume 视频翻译",
    brand: "WinLume 自营",
    category: "apps",
    type: "应用",
    pricing: { kind: "custom", label: "按实际调用模型计费" },
    tagline: "AI 视频深度翻译，字幕、配音与口型同步",
    description: [
      "Lume 视频翻译将视频内容翻译为目标语言，自动生成字幕与配音。",
      "支持声纹保留与口型同步选项。",
    ],
    features: ["字幕自动生成", "声纹保留配音", "口型同步", "20+ 目标语言"],
  },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export interface ProductFilter {
  cate?: string;
  tag?: string;
  brand?: string;
}

export function filterProducts({ cate, tag, brand }: ProductFilter): Product[] {
  return products.filter((p) => {
    if (cate) {
      if (cate === "api" && p.type === "应用") return false;
      if (cate === "app" && p.type !== "应用") return false;
    }
    if (tag && p.category !== tag) return false;
    if (brand && p.brand !== brand) return false;
    return true;
  });
}

export function relatedProducts(product: Product, count = 4): Product[] {
  return products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, count);
}

export function productsByCategory(category: string): Product[] {
  return products.filter((p) => p.category === category);
}
