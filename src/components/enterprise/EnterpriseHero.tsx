import { ArrowDownRight, ArrowRight, Check } from "lucide-react";
import { heroCopy } from "./content";

export default function EnterpriseHero() {
  return (
    <section className="zen-hero" aria-labelledby="zen-hero-title">
      <div className="zen-hero-grid" aria-hidden="true" />
      <span className="zen-hero-pointer-light" aria-hidden="true" />
      <div className="zen-hero-telemetry" aria-hidden="true">
        <span data-zen-clock>SYS.TIME // 00:00:00</span>
        <span data-zen-coordinate>COORD // X:0000 Y:0000</span>
      </div>
      <div className="zen-hero-wireframe" aria-hidden="true">
        <span className="zen-wire-circle zen-wire-circle-one" />
        <span className="zen-wire-circle zen-wire-circle-two" />
        <span className="zen-wire-node zen-wire-node-one">01</span>
        <span className="zen-wire-node zen-wire-node-two">AI</span>
        <span className="zen-wire-node zen-wire-node-three">GO</span>
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
      </div>
      <a className="zen-scroll-hint" href="#insights"><span>{heroCopy.scrollHint}</span><ArrowDownRight aria-hidden /></a>
    </section>
  );
}
