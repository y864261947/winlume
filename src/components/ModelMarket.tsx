"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, CircleHelp, LayoutGrid, Search, ArrowUp } from "lucide-react";
import { useState } from "react";
import { useModals } from "@/components/providers";
import { type Audience } from "@/data/audience";
import { formatBalance } from "@/lib/account";

type AssetIconProps = { src: string; alt?: string; className?: string };

function AssetIcon({ src, alt = "", className }: AssetIconProps) {
  return <Image src={src} alt={alt} width={38} height={38} className={className} />;
}

type PortalLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
};

function PortalLink({ href, children, className, onClick }: PortalLinkProps) {
  return <Link href={href} className={className} onClick={onClick}>{children}</Link>;
}

const apiCategories: Array<{ label: string; icon: string; href: string }> = [
  { label: "语言模型", icon: "/figma-home/icon-chat.svg", href: "/products?cate=api" },
  { label: "图片生成", icon: "/figma-home/icon-image.svg", href: "/products?cate=api" },
  { label: "视频生成", icon: "/figma-home/icon-video.svg", href: "/products?cate=api" },
  { label: "语音处理", icon: "/figma-home/icon-voice.svg", href: "/products?cate=api" },
  { label: "数据与搜索", icon: "/figma-home/icon-search.svg", href: "/products?cate=api" },
  { label: "RAG 与知识库", icon: "/figma-home/icon-db.svg", href: "/products?cate=api" },
];

const industryTools: Array<{ label: string; icon: string }> = [
  { label: "内容与办公", icon: "/figma-home/tool-content.svg" },
  { label: "电商增长", icon: "/figma-home/tool-commerce.svg" },
  { label: "视频创作", icon: "/figma-home/tool-video.svg" },
  { label: "开发与 API", icon: "/figma-home/tool-api.svg" },
  { label: "Agent 自动化", icon: "/figma-home/tool-agent.svg" },
];

const capabilities: Array<{ title: string; subtitle: string; copy: string; icon: string; tone: string }> = [
  { title: "智能体与自动化", subtitle: "让重复工作自动运行", copy: "新建智能体 · 任务流管理 · MCP 工具", icon: "/figma-home/cap-agent.svg", tone: "mint" },
  { title: "模型 API 与工具", subtitle: "即插即用的模型能力", copy: "语言 · 图片 · 视频 · 音频 · RAG", icon: "/figma-home/cap-api.svg", tone: "green" },
  { title: "社区与灵感", subtitle: "从案例得到下一步方向", copy: "热门工具 · 行业动态 · 创作社区", icon: "/figma-home/cap-community.svg", tone: "orange" },
];

const faqs = [
  "如何创建并使用智能体？",
  "Token 如何计算与充值？",
  "如何获取 API Key 并管理权限？",
  "是否支持私有知识库与 MCP 工具？",
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="portal-label">{children}</p>;
}

function ArrowLink({ href = "/products" , children }: { href?: string; children: React.ReactNode }) {
  return <PortalLink href={href} className="portal-arrow-link">{children}<ChevronRight aria-hidden /></PortalLink>;
}

export default function ModelMarket() {
  const { account, balanceConfig, audience, openLogin, selectAudience } = useModals();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const personalActive = audience !== "business";
  const balance = formatBalance(account?.quota, balanceConfig);

  function changeAudience(next: Audience) {
    selectAudience(next);
    setNotice(next === "personal" ? "已切换到个人版" : "已切换到企业版");
    window.setTimeout(() => setNotice(""), 1800);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    setNotice(query.trim() ? `正在搜索“${query.trim()}”` : "请输入想查找的 AI 能力");
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <div className="portal-home">
      <div className="portal-frame">
        <header className="portal-nav" aria-label="主导航">
          <PortalLink href="/" className="portal-brand">Winlume</PortalLink>
          <div className="portal-switcher" role="group" aria-label="版本选择">
            <PortalLink href="/" className={personalActive ? "is-active" : ""} onClick={() => changeAudience("personal")}>个人版</PortalLink>
            <PortalLink href="/business" className={!personalActive ? "is-active" : ""} onClick={() => changeAudience("business")}>企业版</PortalLink>
          </div>
          <nav className="portal-main-links" aria-label="页面导航">
            <PortalLink href="/" className="is-current">首页</PortalLink>
            <PortalLink href="/products?cate=app">AI 应用</PortalLink>
            <PortalLink href="/studio">智能体</PortalLink>
            <PortalLink href="/products?cate=api">API</PortalLink>
            <PortalLink href="/business">企业服务</PortalLink>
          </nav>
          <div className="portal-user-links">
            <PortalLink href="/studio"><LayoutGrid aria-hidden />工作台</PortalLink>
            <button type="button" onClick={() => setNotice("暂无新的通知")}><Bell aria-hidden />通知</button>
            {account ? (
              <PortalLink href="/account" className="portal-account"><span>{(account.display_name || account.username).slice(0, 1).toUpperCase()}</span>{account.display_name || account.username}<ChevronRight aria-hidden /></PortalLink>
            ) : (
              <button type="button" className="portal-account" onClick={() => openLogin("login")}><span>E</span>Elliot<ChevronRight aria-hidden /></button>
            )}
          </div>
        </header>

        <div className="portal-search-row">
          <section className="portal-search-card" aria-labelledby="portal-search-title">
            <Image className="portal-search-waves" src="/figma-home/search-waves.svg" alt="" fill sizes="710px" priority />
            <div className="portal-search-content">
              <SectionLabel>WINLUME AI HUB</SectionLabel>
              <h1 id="portal-search-title">搜索全部 AI 能力</h1>
              <form className="portal-search-form" onSubmit={submitSearch}>
                <Search aria-hidden />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 AI 应用、智能体、模型 API、图片、视频与行业工具..." aria-label="搜索 AI 能力" />
                <button type="submit"><Search aria-hidden />搜索</button>
              </form>
              <div className="portal-chip-list" aria-label="热门能力">
                {["AI 写作", "图片生成", "视频创作", "文件分析", "编程"].map((chip) => (
                  <button key={chip} type="button" className={query === chip ? "is-selected" : ""} onClick={() => { setQuery(chip); setSubmittedQuery(chip); }}>{chip}</button>
                ))}
              </div>
            </div>
            <ArrowLink href="/products">查看热门搜索</ArrowLink>
          </section>

          <section className="portal-usage-card" aria-labelledby="portal-usage-title">
            <div className="portal-card-heading"><Image src="/figma-home/usage-icon.svg" alt="" width={20} height={20} /><h2 id="portal-usage-title">账户用量</h2></div>
            <div className="portal-usage-stats">
              <div><span>余额</span><strong>{balance === "余额同步中" ? "¥168.20" : balance}</strong></div>
              <div><span>Token</span><strong>1.24M</strong></div>
            </div>
            <ArrowLink href="/account/usage">用量明细</ArrowLink>
          </section>
        </div>

        {submittedQuery && <p className="portal-search-result" role="status">已为你准备“{submittedQuery}”相关能力，先从下面的工具分类开始。</p>}

        <div className="portal-discovery-grid">
          <aside className="portal-api-card" aria-labelledby="portal-api-title">
            <h2 id="portal-api-title">API 类别</h2>
            <div className="portal-api-list">
              {apiCategories.map((item) => <PortalLink href={item.href} key={item.label}><AssetIcon src={item.icon} /><span>{item.label}</span></PortalLink>)}
            </div>
            <ArrowLink href="/products?cate=api">查看全部 API</ArrowLink>
          </aside>

          <article className="portal-featured-card">
            <Image className="portal-featured-art" src="/figma-home/featured.svg" alt="" fill sizes="812px" />
            <div className="portal-featured-copy">
              <h2>今日精选</h2><p>AI 行业前沿动态</p><SectionLabel>模型动态</SectionLabel>
              <h3>Kimi 新模型发布</h3><p>长文本、多模态与 Agent 能力迎来新升级</p>
              <PortalLink href="/products?cate=api" className="portal-primary-button">查看详情</PortalLink>
            </div>
            <div className="portal-featured-news">
              <PortalLink href="/products?cate=app">视频生成进入实时编辑阶段</PortalLink>
              <PortalLink href="/products?cate=api">企业 Agent 加速进入业务系统</PortalLink>
              <PortalLink href="/products?cate=app">多模态搜索的下一轮竞争</PortalLink>
            </div>
            <div className="portal-featured-footer"><ArrowLink href="/products">查看全部行业动态</ArrowLink><span>‹ 01 / 04 ›</span></div>
          </article>

          <div className="portal-side-cards">
            <article className="portal-side-card portal-enterprise-card"><SectionLabel>ENTERPRISE</SectionLabel><h2>企业 AI 部署</h2><p>私有化部署、系统集成与专属服务。</p><ArrowLink href="/business">查看方案</ArrowLink><Image src="/figma-home/building.svg" alt="" width={145} height={116} /></article>
            <article className="portal-side-card portal-pricing-card"><h2>计费标准</h2><p>按实际使用量灵活结算，清晰可见。</p><ArrowLink href="/pricing">查看价格</ArrowLink><Image src="/figma-home/price.svg" alt="" width={118} height={108} /></article>
          </div>
        </div>

        <section className="portal-industry-section" aria-labelledby="portal-industry-title">
          <div className="portal-section-header"><div><h2 id="portal-industry-title">行业工具</h2><p>按任务开始，快速找到可用的 AI 工具</p></div><ArrowLink href="/products?cate=app">探索全部工具</ArrowLink></div>
          <div className="portal-industry-grid">{industryTools.map((item) => <PortalLink href="/products?cate=app" className="portal-industry-card" key={item.label}><AssetIcon src={item.icon} /><span>{item.label}</span><ChevronRight aria-hidden /></PortalLink>)}</div>
        </section>

        <section className="portal-capabilities-section" aria-labelledby="portal-capabilities-title">
          <div className="portal-section-header"><div><SectionLabel>EXPLORE WINLUME AI</SectionLabel><h2 id="portal-capabilities-title">从一个任务开始，连接全部 AI 能力</h2><p>覆盖应用、国际、模型、数据和自动化能力，找到合适的应用、智能体或 API。</p></div><ArrowLink href="/products">探索全部能力</ArrowLink></div>
          <div className="portal-capability-grid">{capabilities.map((item) => <PortalLink href="/products" className={`portal-capability-card ${item.tone}`} key={item.title}><AssetIcon src={item.icon} /><div><h3>{item.title}</h3><p>{item.subtitle}</p></div><span className="portal-capability-copy">{item.copy}</span><ChevronRight aria-hidden /></PortalLink>)}</div>
        </section>

        <section className="portal-workflow-section" aria-labelledby="portal-workflow-title">
          <div className="portal-workflow-intro"><SectionLabel>GET STARTED</SectionLabel><h2 id="portal-workflow-title">三步，把 AI 用到你的工作里</h2><p>从发现能力到保存自己的工作流，每一步都可继续扩展。</p></div>
          <div className="portal-workflow-grid">{[["01", "搜索或浏览", "按任务找到适合的 AI 应用与 API"], ["02", "立即试用", "在工作台运行、收藏或创建智能体"], ["03", "保存为流程", "把能力沉淀为可复用的自动化工作流"]].map(([number, title, copy]) => <PortalLink href="/studio" className="portal-workflow-step" key={number}><strong>{number}</strong><h3>{title}</h3><p>{copy}</p></PortalLink>)}</div>
        </section>

        <section className="portal-billing-section" aria-labelledby="portal-billing-title">
          <div className="portal-billing-intro"><SectionLabel>MEMBERSHIP &amp; BILLING</SectionLabel><h2 id="portal-billing-title">按你的使用方式，灵活开始</h2><p>余额、Token 与会员额度清晰可见；需要时再升级。</p></div>
          <div className="portal-plan-grid">{[["随用随付", "按实际用量结算", "查看计费标准"], ["会员额度", "每日更新可用额度", "了解会员权益"], ["团队协作", "共享工具、项目与权限", "创建团队空间"]].map(([title, copy, link], index) => <article className={`portal-plan-card plan-${index + 1}`} key={title}><h3>{title}</h3><p>{copy}</p><ArrowLink href={index === 0 ? "/pricing" : index === 1 ? "/pricing" : "/account/team"}>{link}</ArrowLink></article>)}</div>
        </section>

        <section className="portal-support-section" aria-labelledby="portal-support-title">
          <div className="portal-support-intro"><SectionLabel>SUPPORT</SectionLabel><h2 id="portal-support-title">常见问题与技术支持</h2><p>文档、教程、更新日志与人工支持，都在这里。</p><button type="button" className="portal-support-button" onClick={() => openLogin("login")}><strong>需要帮助？</strong><span>联系技术支持 <ChevronRight aria-hidden /></span></button></div>
          <div className="portal-faq-list">{faqs.map((question, index) => <div className={`portal-faq-item ${openFaq === index ? "is-open" : ""}`} key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)}><span>{question}</span><span aria-hidden>{openFaq === index ? "−" : "+"}</span></button>{openFaq === index && <p>查看文档中心或联系支持团队，我们会协助你完成这一步。</p>}</div>)}</div>
        </section>

        <footer className="portal-footer">
          <div className="portal-footer-brand"><strong>WINLUME</strong><p>AI 能力，真正进入每一天的工作。</p></div>
          {[{ title: "产品", items: ["AI 应用", "智能体", "模型 API", "行业工具"] }, { title: "资源", items: ["API 文档", "教程中心", "更新日志", "开发者社区"] }, { title: "支持", items: ["计费标准", "联系我们", "客户端下载", "常见问题"] }, { title: "法律与合作", items: ["隐私政策", "服务协议", "商务合作", "© 2026 Winlume"] }].map((group) => <div className="portal-footer-column" key={group.title}><h2>{group.title}</h2>{group.items.map((item) => <PortalLink href="/products" key={item}>{item}</PortalLink>)}</div>)}
        </footer>
      </div>

      <aside className="portal-floating-tools" aria-label="快捷工具"><button type="button" onClick={() => openLogin("login")}><CircleHelp aria-hidden /><span>客服</span></button><span className="portal-floating-divider" aria-hidden /><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp aria-hidden /><span>顶部</span></button></aside>
      <div className={`portal-notice ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </div>
  );
}
