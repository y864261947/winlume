export const site = {
  name: "Reizo",
  slogan: "让每一个需求都找到合适的 AI",
  description: "Reizo 是聚合模型 API 与在线应用的 AI 资源平台，支持统一账户、余额与模型目录。",
  announcement: "Reizo 图像工坊全新上线：画布式 AI 图像工作台，生成与编辑一站完成",
};

export interface NavItem {
  label: string;
  href: string;
}

export const mainNav: NavItem[] = [
  { label: "应用超市", href: "/products?cate=app" },
  { label: "API超市", href: "/products?cate=api" },
  { label: "定价", href: "/pricing" },
  { label: "客户端", href: "#" },
  { label: "文章资讯", href: "#" },
];

export interface FooterGroup {
  title: string;
  links: NavItem[];
}

export const footerGroups: FooterGroup[] = [
  {
    title: "快捷访问",
    links: [
      { label: "应用超市", href: "/products?cate=app" },
      { label: "API超市", href: "/products?cate=api" },
      { label: "定价", href: "/pricing" },
      { label: "文章资讯", href: "#" },
    ],
  },
  {
    title: "帮助与支持",
    links: [
      { label: "客户端", href: "#" },
      { label: "常见问题", href: "/support/faq" },
      { label: "联系我们", href: "/support/contact" },
      { label: "帮助中心", href: "/support/faq" },
    ],
  },
  {
    title: "法律声明",
    links: [
      { label: "使用条款", href: "#" },
      { label: "隐私政策", href: "#" },
      { label: "退款政策", href: "#" },
      { label: "知识产权", href: "#" },
    ],
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: "Reizo 是什么？",
    answer:
      "Reizo 是聚合模型 API 与在线应用的 AI 资源平台。产品目录的分类与展示内容仍在迭代中，账户、余额与可用模型则由已接入的 API 网关提供。",
  },
  {
    question: "平台如何收费？",
    answer:
      "账户余额与调用额度由已接入的 API 网关统一管理。当前产品目录中的展示价格仍是前端占位信息，真实扣费规则以网关账户内的定价和用量记录为准。",
  },
  {
    question: "支持哪些使用方式？",
    answer:
      "演示设定支持两种使用方式：通过统一 API 接入各类模型与工具接口，或直接在线使用开箱即用的 AI 应用，两种方式共用同一账户余额。",
  },
  {
    question: "数据安全如何保障？",
    answer:
      "登录、注册、余额和可用模型会通过同域服务安全转发至 API 网关。体验工作台当前仍是前端演示，不会发起真实模型调用或产生调用费用。",
  },
  {
    question: "可以基于这个项目二次开发吗？",
    answer:
      "可以。项目采用数据驱动的组件化结构，产品、分类与文案都集中在数据文件中，方便替换成你自己的内容与品牌。",
  },
];
