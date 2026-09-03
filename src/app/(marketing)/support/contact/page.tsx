import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Headphones, MessageSquareWarning } from "lucide-react";
import { site } from "@/data/site";
import SupportPageShell from "@/components/SupportPageShell";

export const metadata: Metadata = {
  title: `联系支持 - ${site.name}`,
  description: "联系 Reizo 技术支持，获取产品、工作台与 API 使用帮助。",
};

export default function SupportContactPage() {
  return (
    <SupportPageShell
      eyebrow="帮助与支持 / 联系支持"
      title="需要帮助？我们在这里。"
      description="遇到产品使用、工作台运行或 API 接入问题，从合适的入口开始，我们会根据问题类型协助处理。"
      icon={<Headphones aria-hidden />}
      panelLabel="SUPPORT CHANNELS"
      panelTitle="找到适合你的支持方式"
      panelDescription="在线咨询、问题反馈与企业合作，各有清晰的下一步。"
    >
      <section className="portal-support-section" aria-labelledby="contact-section-title">
        <div className="portal-support-section-head">
          <div>
            <p className="portal-support-kicker">CHOOSE AN ENTRY</p>
            <h2 id="contact-section-title">从合适的入口开始</h2>
          </div>
        </div>
        <div className="portal-support-contact-grid">
          <article className="portal-support-contact-card is-primary">
            <span className="portal-support-card-icon"><Headphones aria-hidden /></span>
            <div><h3>在线客服</h3><p>适合咨询产品、账户、余额和日常使用问题。</p></div>
            <Link href="/#portal-support">打开在线客服 <ArrowRight aria-hidden /></Link>
          </article>
          <article className="portal-support-contact-card">
            <span className="portal-support-card-icon"><MessageSquareWarning aria-hidden /></span>
            <div><h3>提交问题</h3><p>反馈具体 Bug 或功能建议，方便我们跟进处理。</p></div>
            <Link href="/studio">前往工作台反馈 <ArrowRight aria-hidden /></Link>
          </article>
          <article className="portal-support-contact-card">
            <span className="portal-support-card-icon"><Building2 aria-hidden /></span>
            <div><h3>企业合作</h3><p>了解企业 AI 智能化解决方案与定制服务。</p></div>
            <Link href="/business">查看企业方案 <ArrowRight aria-hidden /></Link>
          </article>
        </div>
      </section>
    </SupportPageShell>
  );
}
