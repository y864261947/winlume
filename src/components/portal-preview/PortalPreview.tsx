"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, BarChart3, Bot, Box, Check, ChevronLeft, ChevronRight, Code2, Crown, Database, Diamond, FileText, Layers3, LayoutGrid, Menu, Network, Pause, Play, Search, Send, ShieldCheck, Sparkles, Users, Video, X, Zap, Scale } from "lucide-react";
import PortalFooter from "@/components/PortalFooter";
import { useModals } from "@/components/providers";
import type { PortalModelCategory, PortalModelVendor } from "@/lib/portal/content-config";
import type { PortalRoleGroup } from "@/lib/portal/preview-roles";
import styles from "./PortalPreview.module.css";

const categoryCopy: Record<PortalModelCategory, { label: string; description: string }> = {
  llm: { label: "语言与推理", description: "理解、思考与创作，让复杂任务更简单。" },
  image: { label: "图像生成", description: "把脑海中的灵感，变成看得见的作品。" },
  video: { label: "视频创作", description: "从一个想法开始，探索动态影像的可能。" },
  audio: { label: "语音与音频", description: "让声音成为表达与交互的新方式。" },
  embed: { label: "知识检索", description: "连接你的知识，让信息更容易被找到。" },
  other: { label: "搜索与工具", description: "连接更多信息，为每一次回答补充依据。" },
};
const roleIcons = { send: Send, box: Box, scale: Scale, video: Video, grid: LayoutGrid, chart: BarChart3 };
const suggestions = ["生成一份产品策略", "分析竞品情报", "写一封邮件文案", "制作演示文稿"];
const slideNames = ["智能体", "会员权益", "模型监控"];
const navigation = [{ label: "首页", href: "/portal-preview" }, { label: "Agent 工作台", href: "/studio" }, { label: "AI 应用", href: "/products?cate=app" }, { label: "API 模型", href: "/products?cate=api" }, { label: "企业版", href: "/business" }, { label: "价格", href: "/pricing" }];

function Robot() {
  return <div className={styles.robot} aria-hidden="true"><div className={styles.antenna} /><div className={styles.robotHead}><div className={styles.robotFace}><i /><i /></div></div><div className={styles.robotBody} /></div>;
}

function FeatureCarousel({ vendors }: { vendors: PortalModelVendor[] }) {
  const { openMembership } = useModals();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion(); updateVisibility();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => { media.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", updateVisibility); };
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || reduced || !visible) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slideNames.length), 6000);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, reduced, visible]);
  const brands = vendors.filter((vendor, index) => vendors.findIndex((item) => item.key === vendor.key) === index).slice(0, 6);
  return <section className={styles.showcase} aria-label="探索 REIZO 功能" aria-roledescription="轮播" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className={styles.orbit} aria-hidden="true" /><div className={styles.orbitInner} aria-hidden="true" />
    <div className={styles.floatingFeatures} aria-hidden="true">
      <span><FileText />文档对话<small>理解你的知识</small></span>
      <span><Sparkles />图像创作<small>让灵感看得见</small></span>
      <span><Video />视频生成<small>创意不止一面</small></span>
      <span><Code2 />代码开发<small>从想法到实现</small></span>
      <span><BarChart3 />数据分析<small>发现数据价值</small></span>
      <span><LayoutGrid />更多能力<small>探索无限可能</small></span>
    </div>
    <div className={styles.slideStage}>
      <article className={`${styles.featureCard} ${styles.agentCard}`} data-active={active === 0} inert={active !== 0} aria-hidden={active !== 0} aria-label="1 / 3：智能体介绍" aria-roledescription="幻灯片">
        <Robot />
        <span className={styles.featureEyebrow}>你的全能 AI 搭档</span>
        <h2>Hi，我是 REIZO<br />让想法成为作品</h2>
        <ul>{["理解需求，拆解复杂任务", "调用工具，协同完成工作", "文档、图片、代码，一起创作"].map((text) => <li key={text}><Check />{text}</li>)}</ul>
        <Link href="/studio" className={styles.cardCta}>和 REIZO 开始对话<ArrowRight /></Link>
      </article>
      <article className={`${styles.featureCard} ${styles.memberCard}`} data-active={active === 1} inert={active !== 1} aria-hidden={active !== 1} aria-label="2 / 3：会员介绍" aria-roledescription="幻灯片">
        <div className={styles.crown}><Crown /></div><span className={styles.featureEyebrow}>为更进一步的创作</span>
        <h2>一个会员<br />更多 AI 可能</h2>
        <div className={styles.memberBrands}>{brands.map((vendor) => <Image key={vendor.key} src={vendor.logoUrl || "/vendors/other.svg"} alt={vendor.name} width={28} height={28} unoptimized />)}</div>
        <ul>{["集中探索多种模型与工具", "按自己的节奏选择会员方案", "用量与账单，随时清晰可查"].map((text) => <li key={text}><Check />{text}</li>)}</ul>
        <button type="button" onClick={openMembership} className={styles.cardCta}>了解会员权益<ArrowRight /></button>
      </article>
      <article className={`${styles.featureCard} ${styles.monitorCard}`} data-active={active === 2} inert={active !== 2} aria-hidden={active !== 2} aria-label="3 / 3：模型监控介绍" aria-roledescription="幻灯片">
        <div className={styles.monitorHeading}><BarChart3 /><span>模型使用洞察<small>让每一次调用都有迹可循</small></span></div>
        <div className={styles.chartHeading}><strong>活跃趋势</strong><span>演示数据</span></div>
        <div className={styles.chart} aria-label="调用活跃度趋势示意，非实时数据">{[24, 38, 28, 51, 42, 65, 53, 74, 62, 84, 72, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
        <div className={styles.chartAxis}><span>00:00</span><span>12:00</span><span>24:00</span></div>
        <div className={styles.monitorMetrics}><span><Zap />调用用量</span><span><Layers3 />模型分布</span><span><ShieldCheck />费用明细</span></div>
        <Link href="/account/usage" className={styles.cardCta}>查看我的用量<ArrowRight /></Link>
      </article>
    </div>
    <div className={styles.carouselControls}>
      {slideNames.map((name, index) => <button key={name} type="button" aria-label={`查看${name}`} aria-pressed={active === index} onClick={() => setActive(index)}><span />{name}</button>)}
      <button type="button" className={styles.pauseButton} aria-label={paused ? "播放功能轮播" : "暂停功能轮播"} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play /> : <Pause />}</button>
    </div>
  </section>;
}

function ModelMarquee({ vendors, snapshotDate }: { vendors: PortalModelVendor[]; snapshotDate?: string }) {
  const [paused, setPaused] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const models = [...vendors].filter((vendor) => vendor.enabled && vendor.models.length).sort((a, b) => Number(b.category === "llm") - Number(a.category === "llm"));
  function scroll(direction: number) {
    setPaused(true);
    scroller.current?.scrollBy({ left: direction * 250, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <section className={styles.models} aria-labelledby="preview-models-title">
    <div className={styles.sectionHeading}><div><h2 id="preview-models-title">好模型，在这里相遇</h2><p>连接全球 AI 能力，找到适合每一项工作的模型。</p></div><Link href="/products?cate=api">查看全部模型<ArrowRight /></Link></div>
    <div className={styles.marqueeViewport} ref={scroller} data-paused={paused}>
      {models.length ? <div className={styles.marqueeTrack}>{[0, 1].map((copy) => <div className={styles.modelSet} key={copy} aria-hidden={copy === 1}>{models.map((vendor) => <Link href={`/products?cate=api&brand=${encodeURIComponent(vendor.key)}`} className={styles.modelCard} key={vendor.id} tabIndex={copy === 1 ? -1 : undefined}>
        <div className={styles.modelBrand}><Image src={vendor.logoUrl || "/vendors/other.svg"} alt="" width={36} height={36} unoptimized /><div><strong>{vendor.models[0].name}</strong><span>{vendor.name}</span></div></div>
        <p>{vendor.models[0].description || categoryCopy[vendor.category].description}</p><div className={styles.modelCardFoot}><span>{categoryCopy[vendor.category].label}</span><small>{vendor.models.length} 款模型<ArrowRight /></small></div>
      </Link>)}</div>)}</div> : <p className={styles.emptyModels}>模型目录更新中，前往模型中心查看可用能力。</p>}
    </div>
    <div className={styles.modelControls}><span>{snapshotDate ? `线上模型目录快照 · ${snapshotDate}` : "模型目录随平台发布持续更新"}</span><div><button type="button" onClick={() => scroll(-1)} aria-label="向左浏览模型"><ChevronLeft /></button><button type="button" onClick={() => { scroller.current?.scrollTo({ left: 0 }); setPaused(!paused); }} aria-label={paused ? "播放模型滚动" : "暂停模型滚动"} aria-pressed={paused}>{paused ? <Play /> : <Pause />}</button><button type="button" onClick={() => scroll(1)} aria-label="向右浏览模型"><ChevronRight /></button></div></div>
  </section>;
}

/** Decorative, local vector portraits keep role identities distinct without
 * presenting stock people as actual team members. */
function RolePortrait({ index }: { index: number }) {
  const colors = ["#527baf", "#876cba", "#526b83", "#ac7865", "#448e94", "#777bbb"];
  const hair = ["#44342d", "#292f40", "#503c39"];
  const female = index % 3 !== 2;
  return <svg viewBox="0 0 80 78" className={styles.portrait} aria-hidden="true"><path d="M10 78c1-22 13-28 30-28s29 6 30 28" fill={colors[index % colors.length]} />{female && <path d="M20 51V29c0-29 40-29 40 0v25z" fill={hair[index % 3]} />}<path d="M32 48h16v14l-8 8-8-8" fill="#edc0a2" /><ellipse cx="40" cy="32" rx="16" ry="21" fill="#f5d5bd" /><path d={female ? "M24 31C18 12 31 5 41 7c17-2 23 12 15 25l-4-17c-6 9-16 9-28 16" : "M24 30c-7-13 1-23 15-23 19-2 24 10 18 24l-6-14c-8 6-17 2-23 3z"} fill={hair[index % 3]} /><path d="m31 59 9 11-10 6-5-19m24 2-9 11 10 6 5-19" fill="#fff" /><circle cx="34" cy="33" r="1.3" fill="#534744" /><circle cx="46" cy="33" r="1.3" fill="#534744" /><path d="M36 42q4 3 8 0" fill="none" stroke="#c88c79" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

export default function PortalPreview({ vendors, roleGroups, modelSnapshotDate }: { vendors: PortalModelVendor[]; roleGroups: PortalRoleGroup[]; modelSnapshotDate?: string }) {
  const router = useRouter();
  const { account, openLogin, openSearch } = useModals();
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    router.push(prompt ? `/studio?${new URLSearchParams({ prompt })}` : "/studio");
  }
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/portal-preview" className={styles.logo} aria-label="REIZO 新版首页"><Image src="/brand/logo-day.png" width={33} height={33} alt="" priority unoptimized />REIZO</Link>
      <nav className={styles.desktopNav} aria-label="主导航">{navigation.map((item, index) => <Link key={item.href} href={item.href} aria-current={index === 0 ? "page" : undefined}>{item.label}</Link>)}</nav>
      <div className={styles.headerActions}><button type="button" aria-label="搜索" onClick={openSearch}><Search /></button>{account ? <Link className={styles.login} href="/account">个人中心</Link> : <button type="button" className={styles.login} onClick={() => openLogin("login")}>登录</button>}<Link href="/studio" className={styles.startButton}>开始使用<ArrowRight /></Link><button type="button" className={styles.menuButton} aria-label={menuOpen ? "关闭导航" : "展开导航"} aria-expanded={menuOpen} aria-controls="preview-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div>
      {menuOpen && <nav id="preview-mobile-nav" className={styles.mobileNav} aria-label="移动导航" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>{navigation.map((item) => <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}<button type="button" onClick={() => { setMenuOpen(false); openSearch(); }}>搜索模型与应用</button>{!account && <button type="button" onClick={() => { setMenuOpen(false); openLogin("login"); }}>登录 / 注册</button>}</nav>}
    </header>
    <main>
      <section className={styles.hero} aria-labelledby="preview-hero-title"><div className={styles.heroInner}>
        <div className={styles.heroCopy}><div className={styles.heroBadge}><span />从一个想法，开始无限可能</div><h1 id="preview-hero-title">让 AI 为你的<br />工作与创造力<span>加速</span></h1><p className={styles.heroDescription}>对话、创作、分析、解决问题。<br />REIZO 汇聚 AI 模型与工具，陪你把每一个想法变成现实。</p>
          <form className={styles.composer} onSubmit={submit}><label htmlFor="portal-preview-prompt"><span className={styles.composerIcon}><Bot /></span><strong>REIZO Agent 工作台</strong><span className={styles.composerTag}>从对话到完成</span></label><textarea ref={input} id="portal-preview-prompt" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="告诉 REIZO，你今天想完成什么？" maxLength={4000} rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className={styles.composerBottom}><span><Sparkles />把复杂的事，交给 AI</span><button type="submit"><Send />进入工作台</button></div></form>
          <div className={styles.suggestions}><span>试一试</span>{suggestions.map((text) => <button type="button" key={text} onClick={() => { setDraft(text); input.current?.focus(); }}>{text}</button>)}</div>
        </div><FeatureCarousel vendors={vendors.filter((vendor) => vendor.enabled)} />
      </div><a href="#preview-models-title" className={styles.exploreLink}>探索更多可能<ArrowDown /></a></section>
      <div className={styles.content}><ModelMarquee vendors={vendors} snapshotDate={modelSnapshotDate} />
        <section className={styles.roles} aria-labelledby="preview-roles-title"><div className={styles.sectionHeading}><div><h2 id="preview-roles-title">你的行业，自有 AI 行家</h2><p>专业角色，随时就位。选择一位助手，带着你的任务直接开始。</p></div><Link href="/studio/skills">探索全部助手<ArrowRight /></Link></div>
          <div className={styles.roleGrid}>{roleGroups.map((group, groupIndex) => { const Icon = roleIcons[group.icon]; return <article key={group.id} className={styles.roleGroup}><div className={styles.roleHeading}><span><Icon /></span><div><h3>{group.title}</h3><p>{group.description}</p></div></div><div className={styles.roleMembers}>{group.roles.map((role, index) => <Link key={role.id} href={role.href} className={styles.roleMember} aria-label={`使用${role.label}`}><div className={styles.portraitWrap}><RolePortrait index={groupIndex * 3 + index} /><span><ArrowRight /></span></div><strong>{role.label}</strong><ul>{role.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul></Link>)}</div></article>; })}</div>
          {!roleGroups.length && <p className={styles.emptyModels}>行业助手正在更新，前往 Skills 探索更多能力。</p>}
        </section>
      </div>
      <section className={styles.enterprise} aria-labelledby="preview-enterprise-title"><div className={styles.enterpriseInner}><div className={styles.enterpriseCopy}><span>为团队，连接更大的可能</span><h2 id="preview-enterprise-title">让 AI，融入你的业务</h2><p>从企业知识到业务流程，从专属智能体到私有化部署。<br />和 REIZO 一起，找到适合你的企业 AI 方案。</p><Link href="/business" className={styles.enterpriseCta}>了解企业方案<ArrowRight /></Link></div><div className={styles.enterpriseGraphic} aria-hidden="true"><div className={styles.enterpriseNode}><Database /><span>企业知识</span></div><i /><div className={styles.enterpriseCore}><Image src="/brand/logo-day.png" width={44} height={44} alt="" unoptimized /><strong>REIZO</strong></div><i /><div className={styles.enterpriseNode}><Network /><span>业务系统</span></div><div className={styles.enterpriseCaption}><ShieldCheck />企业数据 · 专属连接 · 协作交付</div></div><ul className={styles.enterpriseServices}><li><Database />知识库与 RAG</li><li><Network />系统集成与私有化部署</li><li><Bot />企业 Agent 定制</li><li><Layers3 />行业解决方案</li></ul></div></section>
      <div className={styles.trustStrip}>{[{ icon: Zap, title: "一个账户", detail: "连接多种 AI 能力" }, { icon: ShieldCheck, title: "安全可控", detail: "按需设计企业部署方案" }, { icon: Diamond, title: "灵活计费", detail: "按需选择，清晰掌握用量" }, { icon: Users, title: "专业服务", detail: "从个人到企业的全流程支持" }].map(({ icon: Icon, title, detail }) => <div key={title}><span><Icon /></span><div><strong>{title}</strong><p>{detail}</p></div></div>)}</div>
    </main>
    <PortalFooter />
  </div>;
}
