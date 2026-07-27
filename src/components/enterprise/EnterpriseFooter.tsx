"use client";

import { useState } from "react";
import { ArrowDownRight, ChevronDown, Link2 } from "lucide-react";
import { faqCopy, footerCopy } from "./content";

export default function EnterpriseFooter() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  return (
    <>
      <section className="zen-faq zen-container" aria-labelledby="faq-title">
        <header data-zen-motion><p className="zen-label">{faqCopy.eyebrow}</p><h2 id="faq-title">{faqCopy.title}</h2><p>{faqCopy.body}</p></header>
        <div data-zen-motion="right" data-zen-motion-delay="80">{faqCopy.entries.map((item) => { const isOpen = openFaq === item.id; return <article key={item.id}><button type="button" aria-expanded={isOpen} onClick={() => setOpenFaq(isOpen ? null : item.id)}><span>{item.question}</span><ChevronDown aria-hidden /></button><div className="zen-faq-answer" data-open={isOpen}><div><p>{item.answer}</p></div></div></article>; })}</div>
      </section>
      <footer id="footer" className="zen-footer" aria-label="ZenAI 页脚">
        <div className="zen-container">
          <div className="zen-footer-cta" data-zen-motion><p className="zen-label">{footerCopy.eyebrow}</p><h2>{footerCopy.title}</h2><p>{footerCopy.body}</p><a href="#assessment" className="zen-button zen-button-light">{footerCopy.action}<ArrowDownRight aria-hidden /></a></div>
          <div className="zen-footer-bottom"><div><strong>ZEN</strong><span>{footerCopy.location}</span></div><address>{footerCopy.contactLinks.map((link) => <a key={link.label} href={link.href}>{link.label}</a>)}</address><div className="zen-footer-social"><a href="#footer" aria-label="社交链接"><Link2 aria-hidden /></a><span>{footerCopy.copyright}</span></div></div>
        </div>
      </footer>
    </>
  );
}
