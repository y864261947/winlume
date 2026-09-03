import Link from "next/link";
import { ArrowLeft, ArrowRight, LifeBuoy } from "lucide-react";
import type { ReactNode } from "react";

type SupportPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon?: ReactNode;
  panelLabel: string;
  panelTitle: string;
  panelDescription: string;
  children: ReactNode;
};

export default function SupportPageShell({
  eyebrow,
  title,
  description,
  icon,
  panelLabel,
  panelTitle,
  panelDescription,
  children,
}: SupportPageShellProps) {
  return (
    <div className="portal-support-page">
      <div className="portal-support-container">
        <Link href="/" className="portal-support-back">
          <ArrowLeft aria-hidden /> 返回首页
        </Link>

        <section className="portal-support-hero" aria-labelledby="support-page-title">
          <div className="portal-support-hero-copy">
            <p className="portal-support-eyebrow">
              <span>{icon ?? <LifeBuoy aria-hidden />}</span>
              {eyebrow}
            </p>
            <h1 id="support-page-title">{title}</h1>
            <p className="portal-support-hero-description">{description}</p>
          </div>
          <div className="portal-support-hero-panel" aria-label={panelTitle}>
            <div className="portal-support-panel-topline">
              <span className="portal-support-status-dot" />{panelLabel}
            </div>
            <div className="portal-support-panel-rule" />
            <strong>{panelTitle}</strong>
            <p>{panelDescription}</p>
            <span className="portal-support-panel-arrow"><ArrowRight aria-hidden /></span>
          </div>
        </section>

        <div className="portal-support-content">{children}</div>

        <section className="portal-support-cta" aria-label="继续获取帮助">
          <div>
            <p className="portal-support-eyebrow">NEED MORE HELP?</p>
            <h2>从一个清晰的入口开始。</h2>
            <p>进入工作台，继续使用 Reizo 的模型、应用与支持工具。</p>
          </div>
          <Link href="/studio" className="portal-support-cta-link">
            进入工作台 <ArrowRight aria-hidden />
          </Link>
        </section>
      </div>
    </div>
  );
}
