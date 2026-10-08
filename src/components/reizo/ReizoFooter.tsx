import Link from "next/link";
import Image from "next/image";
import { AppearanceSelector } from "./AppearanceProvider";
export default function ReizoFooter() {
  return <footer className="site-footer"><div className="shell"><AppearanceSelector />
    <div className="footer-grid"><section className="footer-brand"><Link className="brand" href="/"><Image unoptimized src="/reizo/assets/reizo-mark.png" alt="" width="32" height="32" />REIZO</Link><p>睿舟 REIZO 是一个集成 Agent、AI 模型、API 与应用能力的一体化 AI 平台，让个人、开发者与企业更简单、更高效地使用 AI。</p></section>
      <section className="footer-column"><h2>服务</h2><Link href="/agent">智能体</Link><Link href="/models">模型与 API</Link><Link href="/business">企业级 AI 解决方案</Link></section>
      <section className="footer-column"><h2>资源</h2><Link href="/docs">开发文档</Link><Link href="/pricing">模型计费</Link><Link href="/account/community">交流社区</Link><Link href="/support">使用支持</Link></section>
      <section className="footer-column"><h2>关于</h2><Link href="/support#about">关于我们</Link><Link href="/business/contact">商务合作</Link><Link href="/cases">应用案例</Link></section></div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} REIZO. All rights reserved.</span><div><Link href="/legal/privacy">隐私政策</Link><Link href="/legal/terms">服务条款</Link><Link href="/account/security">安全性</Link></div></div>
  </div></footer>;
}
