import { ArrowDownRight, ArrowRight, Check, Rocket, ShieldCheck, Waypoints } from "lucide-react";
import { heroCopy, platformCopy } from "./content";

const solutionIcons = [Rocket, Waypoints, ShieldCheck] as const;

export default function EnterpriseHero() {
  return (
    <section className="zen-hero" aria-labelledby="zen-hero-title">
      <div className="zen-hero-grid" aria-hidden="true" />
      <span className="zen-hero-pointer-light" aria-hidden="true" />
      <div className="zen-hero-telemetry" aria-hidden="true">
        <span data-zen-clock>SYS.TIME // 00:00:00</span>
        <span data-zen-coordinate>COORD // X:0000 Y:0000</span>
      </div>
      <div className="zen-hero-wireframe zen-hero-visual" aria-hidden="true">
        <div className="zen-hero-cube">
          <span className="zen-cube-face zen-cube-face-front" />
          <span className="zen-cube-face zen-cube-face-back" />
          <span className="zen-cube-face zen-cube-face-left" />
          <span className="zen-cube-face zen-cube-face-right" />
          <span className="zen-cube-face zen-cube-face-top" />
          <span className="zen-cube-face zen-cube-face-bottom" />
        </div>
      </div>
      <div className="zen-container zen-hero-inner">
        <div className="zen-hero-copy">
          <p className="zen-hero-kicker zen-hero-intro">{heroCopy.eyebrow}</p>
          <h1 id="zen-hero-title" className="zen-hero-intro"><span>{heroCopy.titleLead}</span>{heroCopy.titleAccent}</h1>
          <p className="zen-hero-deck zen-hero-intro">{heroCopy.deck}<br />{heroCopy.body}</p>
          <div className="zen-hero-actions zen-hero-intro">
            <a className="zen-button zen-button-dark" href="#assessment">{heroCopy.primaryAction}<ArrowDownRight aria-hidden /></a>
            <a className="zen-link-arrow" href="#assessment">{heroCopy.secondaryAction}<ArrowRight aria-hidden /></a>
          </div>
          <p className="zen-hero-trust zen-hero-intro"><Check aria-hidden />{heroCopy.trustKicker}<span>{heroCopy.trustHighlight}</span></p>
        </div>
        <div className="zen-hero-solutions" aria-label="企业级解决方案">
          <h2>企业级解决方案</h2>
          <div>
            {platformCopy.cards.map((card, index) => {
              const Icon = solutionIcons[index];
              return <a key={card.name} className="zen-hero-solution" href="#assessment">
                <Icon aria-hidden />
                <span><strong>{card.name}</strong><small>{card.description}</small></span>
                <ArrowRight aria-hidden />
              </a>;
            })}
          </div>
        </div>
        <dl className="zen-hero-metrics" aria-label="企业级服务指标">
          <div><dt>SOC 2</dt><dd>Type II 认证</dd></div>
          <div><dt>99.99%</dt><dd>系统正常运行时间</dd></div>
          <div><dt>24/7</dt><dd>全球运维支持</dd></div>
          <div><dt>企业级</dt><dd>安全架构标准</dd></div>
        </dl>
      </div>
      <a className="zen-scroll-hint" href="#insights"><span>{heroCopy.scrollHint}</span><ArrowDownRight aria-hidden /></a>
    </section>
  );
}
