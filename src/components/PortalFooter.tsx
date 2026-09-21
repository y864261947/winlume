import Image from "next/image";
import Link from "next/link";
import styles from "./PortalFooter.module.css";

const footerColumns = [
  {
    title: "产品",
    items: [
      { label: "Agent工作台", href: "/studio" },
      { label: "API模型", href: "/products?cate=api" },
      { label: "AI应用工具", href: "/products?cate=app" },
      { label: "Skills", href: "/studio/skills" },
    ],
  },

  {
    title: "企业服务",
    items: [
      { label: "企业AI解决方案", href: "/business" },
      { label: "私有化部署", href: "/business/deployment" },
      { label: "系统集成", href: "/business/deployment" },
      { label: "AI部署咨询", href: "/business/consultant" },
    ],
  },
  {
    title: "开发者",
    items: [
      { label: "API文档", href: "/docs" },
      { label: "API密钥", href: "/account/keys" },
      { label: "调用日志", href: "/account/logs" },
      { label: "模型计费", href: "/pricing" },
    ],
  },
  {
    title: "账户与计费",
    items: [
      { label: "个人中心", href: "/account" },
      { label: "会员方案", href: "/account/pricing" },
      { label: "钱包与充值", href: "/account/wallet" },
    ],
  },
  {
    title: "支持",
    items: [
      { label: "帮助中心", href: "/support/faq" },
      { label: "常见问题", href: "/support/faq" },
      { label: "联系支持", href: "/support/contact" },
      { label: "商务合作", href: "/business" },
    ],
  },
] as const;

const footerLegalLinks = [
  { label: "隐私政策", href: "/legal/privacy" },
  { label: "服务条款", href: "/legal/terms" },
  { label: "免责声明", href: "/legal/disclaimer" },
] as const;

export default function PortalFooter() {
  return (
    <footer className={styles.footer} aria-label="网站页脚">
      {footerColumns.map((group) => (
        <nav className={styles.column} key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          {group.items.map((item) => <Link href={item.href} key={item.label} target="_blank" rel="noopener noreferrer">{item.label}</Link>)}
        </nav>
      ))}
      <div className={styles.brand}>
        <strong><Image src="/brand/logo-day.png" alt="" width={30} height={30} unoptimized />REIZO</strong>
        <p>从 AI 能力到智能体，每一步都更简单。</p>
        <div className={styles.meta}>
          <small>© 2026 Reizo. All rights reserved.</small>
          <nav className={styles.legal} aria-label="法律信息">
            {footerLegalLinks.map((item) => <Link href={item.href} key={item.href} target="_blank" rel="noopener noreferrer">{item.label}</Link>)}
          </nav>
        </div>
      </div>
    </footer>
  );
}
