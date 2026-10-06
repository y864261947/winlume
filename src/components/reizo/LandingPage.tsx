"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Menu, Plus, X } from "lucide-react";
import { useModals } from "@/components/providers";
import { cn } from "@/lib/utils";
import ExperienceSurface, { type Project } from "./ExperienceSurface";
import ProjectDeliverables from "./ProjectDeliverables";
import { LandingTitle, LandingDescription, LandingActions, LandingProduct, useLandingIntro } from "./LandingIntro";
import "./landing.css";

const navigation = [["#workspace", "Agent 工作台"], ["#projects", "项目与作品"], ["#api", "模型与 API"], ["/pricing", "会员与价格"]];
const providers = [
  ["openai", "OpenAI"], ["anthropic", "Anthropic"], ["gemini", "Gemini"], ["deepseek", "DeepSeek"], ["kimi", "Kimi"], ["kling", "可灵"],
];

function Brand() {
  return <Link href="/" className="landing-brand" aria-label="REIZO 首页"><Image src="/reizo/assets/reizo-mark.png" alt="" width={27} height={27} unoptimized /><span>REIZO</span></Link>;
}

export default function LandingPage() {
  const intro = useLandingIntro();
  const { openLogin, account, accountLoading } = useModals();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [heroProject, setHeroProject] = useState<Project>("commerce");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const code = `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="YOUR_REIZO_API_KEY",\n    base_url="YOUR_REIZO_API_BASE"\n)\n\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_ID",\n    messages=[\n        {"role": "user", "content": "开始创作"}\n    ]\n)`;
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  function openProject(project: Project) {
    setHeroProject(project);
    document.getElementById("workspace")?.scrollIntoView({ block: "start", behavior: intro.reduced ? "instant" : "smooth" });
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return <div className="reizo-landing">
    <a className="landing-skip" href="#main">跳至正文</a>
    <header className="landing-header"><div className="landing-shell landing-nav">
      <Brand />
      <nav id="landing-navigation" aria-label="主导航" className={cn(menuOpen && "is-open")}>
        {navigation.map(([href, label]) => href.startsWith("#")
          ? <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          : <Link key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}
      </nav>
      <div className="landing-nav-actions">
        {account ? <Link className="landing-login" href="/account">我的账户</Link> : <button type="button" className="landing-login" disabled={accountLoading} onClick={() => openLogin()}>登录</button>}
        <Link className="landing-button landing-button-small" href="/studio">打开工作台 <ArrowUpRight size={14} /></Link>
        <button type="button" className="landing-menu" aria-label={menuOpen ? "关闭导航" : "展开导航"} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div></header>
    <main id="main">
      <section className="landing-hero landing-shell" aria-labelledby="landing-title">
        <div className="hero-intro">
          <LandingTitle reduced={intro.reduced} />
          <LandingDescription {...intro}>处理资料、调用工具。对话、文件与创作画布，留在同一个项目中。</LandingDescription>
          <LandingActions {...intro}><Link className="landing-button" href="/studio">打开 REIZO <ArrowUpRight size={16} /></Link></LandingActions>
        </div>
        <LandingProduct {...intro}><ExperienceSurface project={heroProject} active={intro.reduced || intro.phase >= 4} onProjectChange={setHeroProject} /></LandingProduct>
      </section>

      <section className="landing-workflows landing-shell" aria-labelledby="workflow-title">
        <h2 id="workflow-title">文件、工具与画布，放在一起。</h2>
        <div className="workflow-columns">
          <div><h3>文件与资料</h3><p>读取项目里的文件，引用素材与参考链接，把任务所需的资料整理在一起。</p></div>
          <div><h3>工具与步骤</h3><p>在对话里查看工具调用和任务进度，需要确认时，在当前任务里继续。</p></div>
          <div><h3>画布与作品</h3><p>图像、视频与文档进入同一张画布，继续编辑、连线和生成。</p></div>
        </div>
      </section>

      <ProjectDeliverables onOpenProject={openProject} />

      <section className="landing-api landing-shell" id="api" aria-labelledby="api-title"><div><h2 id="api-title">模型与 API</h2><p>使用 API Key 调用多种模型，沿用 OpenAI 兼容接口，按实际用量计费。</p><div className="api-models" aria-label="支持的模型">{providers.map(([icon, name]) => <Link href="/products?cate=api" key={icon}><Image src={"/reizo/assets/" + icon + ".svg"} width={21} height={21} alt="" unoptimized /><span>{name}</span></Link>)}</div><div className="landing-inline-links"><Link className="landing-text-link" href="/products?cate=api">查看模型与计费 <ArrowUpRight size={15} /></Link><Link className="landing-text-link" href="/docs">开发文档 <ArrowUpRight size={15} /></Link></div></div><details className="api-example"><summary>调用示例 <Plus size={15} /></summary><div className="api-code"><div className="api-code-bar"><span>Python</span><button aria-label="复制 Python 示例" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setCopyError(false); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000); } catch { setCopyError(true); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "已复制" : "复制"}</button></div><pre><code><span className="code-muted">from</span> openai <span className="code-muted">import</span> OpenAI{"\n\n"}client = OpenAI({"\n"}    api_key=<span className="code-string">&quot;YOUR_REIZO_API_KEY&quot;</span>,{"\n"}    base_url=<span className="code-string">&quot;YOUR_REIZO_API_BASE&quot;</span>{"\n"}){"\n\n"}response = client.chat.completions.create({"\n"}    model=<span className="code-string">&quot;YOUR_MODEL_ID&quot;</span>,{"\n"}    messages=[{"\n"}        &#123;<span className="code-string">&quot;role&quot;</span>: <span className="code-string">&quot;user&quot;</span>, <span className="code-string">&quot;content&quot;</span>: <span className="code-string">&quot;开始创作&quot;</span>&#125;{"\n"}    ]{"\n"})</code></pre>{copyError && <p role="status" className="copy-error">复制未完成，请选中示例代码复制。</p>}</div></details></section>

      <section className="landing-faq landing-shell" aria-labelledby="faq-title">
        <div><h2 id="faq-title">常见问题</h2><Link className="landing-text-link" href="/support/faq">使用支持 <ArrowUpRight size={15} /></Link></div>
        <div className="faq-items">
          <details><summary>可以直接在这里运行任务吗？<Plus size={16} /></summary><p>这里可以查看项目、移动节点和编辑文字。正式运行 Agent 或生成新作品，请进入工作台。</p></details>
          <details><summary>API 能接入现有项目吗？<Plus size={16} /></summary><p>模型 API 使用 OpenAI 兼容接口。在现有项目中配置 REIZO API Key、接口地址和模型 ID 即可接入，具体参数见开发文档。</p><Link href="/docs">查看开发文档 <ArrowUpRight size={13} /></Link></details>
          <details><summary>模型与工作台如何计费？<Plus size={16} /></summary><p>工作台和模型 API 共用账户余额。会员权益在会员页查看，各模型的单价和计费方式在模型页查看。</p></details>
          <details><summary>在哪里查看支持的模型？<Plus size={16} /></summary><p>模型页列出了当前上架的语言、图像、视频和音频模型，以及对应价格与能力。</p><Link href="/products?cate=api">查看模型 <ArrowUpRight size={13} /></Link></details>
        </div>
      </section>

    </main>
    <footer className="landing-footer"><div className="landing-shell"><div className="landing-footer-top"><div><Brand /></div><div><h3>产品</h3><Link href="#workspace">Agent 工作台</Link><Link href="/products?cate=api">模型与 API</Link><Link href="/pricing">会员与价格</Link></div><div><h3>资源</h3><Link href="/support/contact">获取客户端</Link><Link href="/docs">开发文档</Link><Link href="/support/faq">使用支持</Link></div><div><h3>企业</h3><Link href="/business">企业服务</Link><Link href="/business/consultant">商务合作</Link></div></div><div className="landing-footer-bottom"><span>© {new Date().getFullYear()} REIZO</span><div><Link href="/legal/privacy">隐私政策</Link><Link href="/legal/terms">服务条款</Link><span>简体中文</span></div></div></div></footer>
  </div>;
}
