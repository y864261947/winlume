import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";
import { faqItems, site } from "@/data/site";
import SupportPageShell from "@/components/SupportPageShell";

export const metadata: Metadata = {
  title: `常见问题 - ${site.name}`,
  description: "查看 Reizo 平台、账户、计费与工作台的常见问题。",
};

export default function SupportFaqPage() {
  return (
    <SupportPageShell
      eyebrow="帮助与支持 / 常见问题"
      title="常见问题，先在这里找到答案。"
      description="从产品目录和工作台使用，到账户、余额与 API 接入，把常见问题整理成一份可快速查阅的指南。"
      icon={<CircleHelp aria-hidden />}
      panelLabel="REIZO SUPPORT"
      panelTitle="清晰、可靠的使用指引"
      panelDescription="覆盖账户、计费、模型与工作台的常见场景。"
    >
      <section className="portal-support-section" aria-labelledby="faq-section-title">
        <div className="portal-support-section-head">
          <div>
            <p className="portal-support-kicker">QUICK ANSWERS</p>
            <h2 id="faq-section-title">你可能正在寻找</h2>
          </div>
          <span className="portal-support-count">{faqItems.length} 个问题</span>
        </div>
        <div className="portal-support-faq-list">
          {faqItems.map((item, index) => (
            <details key={item.question} className="portal-support-faq-item" open={index === 0}>
              <summary>
                <span className="portal-support-faq-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="portal-support-faq-question">{item.question}</span>
                <span className="portal-support-faq-mark" aria-hidden>+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
        <div className="portal-support-inline-link">
          <span>仍未解决你的问题？</span>
          <Link href="/support/contact">联系支持 <ArrowRight aria-hidden /></Link>
        </div>
      </section>
    </SupportPageShell>
  );
}
