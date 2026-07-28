"use client";

import { useEffect, useState, type TransitionEventHandler } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, Building2, Check, ChevronDown,
  CirclePlay, Factory, GraduationCap, Pause, Plane, ShieldCheck,
  ShoppingBag, Sparkles,
} from "lucide-react";
import {
  caseSectionCopy, deliveryCards, deliveryProof, logisticsCases, partnerCopy,
  platformCopy, voiceDemoCopy,
} from "./content";

const industryIcons = { activity: Activity, factory: Factory, "shopping-bag": ShoppingBag, "shield-check": ShieldCheck, "graduation-cap": GraduationCap, plane: Plane };
type VoiceScenario = (typeof voiceDemoCopy.scenarios)[number];

function VoiceStage({
  scenario,
  className,
  ariaHidden,
  onTransitionEnd,
}: {
  scenario: VoiceScenario;
  className: string;
  ariaHidden?: boolean;
  onTransitionEnd?: TransitionEventHandler<HTMLDivElement>;
}) {
  return (
    <div className={className} aria-hidden={ariaHidden || undefined} onTransitionEnd={onTransitionEnd}>
      <div className="zen-voice-metric"><strong>{scenario.metric}</strong><span>{scenario.metricDescription}</span></div>
      <div className="zen-transcript">{scenario.transcript.map((line, index) => <p key={`${line.speaker}-${index}`} className={line.speaker === "AI" ? "is-ai" : ""}><b>{line.speaker}</b>{line.text}</p>)}</div>
    </div>
  );
}

export default function EnterpriseNarrative() {
  const [expandedCases, setExpandedCases] = useState(false);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [priorScenario, setPriorScenario] = useState<VoiceScenario | null>(null);
  const [incomingScenarioActive, setIncomingScenarioActive] = useState(true);
  const scenario = voiceDemoCopy.scenarios[scenarioIndex];

  useEffect(() => {
    if (!priorScenario) return;
    const frame = window.requestAnimationFrame(() => setIncomingScenarioActive(true));
    return () => window.cancelAnimationFrame(frame);
  }, [priorScenario, scenario.id]);

  const selectScenario = (index: number) => {
    setPlaying(false);
    if (index === scenarioIndex) return;
    setPriorScenario(scenario);
    setIncomingScenarioActive(false);
    setScenarioIndex(index);
  };

  const clearPriorScenario: TransitionEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget && event.propertyName === "opacity") setPriorScenario(null);
  };

  return (
    <>
      <section id="insights" className="zen-trust zen-container" aria-labelledby="trust-title">
        <div className="zen-section-intro" data-zen-motion>
          <p className="zen-label">{partnerCopy.eyebrow}</p>
          <h2 id="trust-title">{partnerCopy.titlePrimary}<br />{partnerCopy.titleSecondary}</h2>
          <p>{partnerCopy.detail}</p>
        </div>
        <div className="zen-trust-side" data-zen-motion="right" data-zen-motion-delay="80">
          <dl className="zen-metrics">{partnerCopy.metrics.map((metric) => <div key={metric.label}><dt>{metric.value}</dt><dd>{metric.label}</dd></div>)}</dl>
          <div className="zen-industries" aria-label="服务行业">{partnerCopy.industries.map((industry) => { const Icon = industryIcons[industry.icon]; return <span key={industry.label}><Icon aria-hidden />{industry.label}</span>; })}</div>
        </div>
      </section>

      <section className="zen-platform" aria-labelledby="platform-title">
        <div className="zen-container">
          <header className="zen-platform-heading" data-zen-motion><p className="zen-label">{platformCopy.eyebrow}</p><h2 id="platform-title">{platformCopy.title}</h2></header>
          <div className="zen-platform-cards">{platformCopy.cards.map((card, index) => <article key={card.name} className={`zen-platform-card zen-platform-card-${index + 1}`} data-zen-motion data-zen-motion-delay={index * 70}><span>{card.index}</span><div className="zen-platform-symbol" aria-hidden>{index === 0 ? <Sparkles /> : index === 1 ? <Building2 /> : <ShieldCheck />}</div><h3>{card.name}</h3><p>{card.description}</p><ArrowDownRight aria-hidden /></article>)}</div>
        </div>
      </section>

      <section className="zen-delivery zen-container" aria-labelledby="delivery-title">
        <header className="zen-delivery-head" data-zen-motion><p className="zen-label">SYSTEMS THAT SHIP</p><h2 id="delivery-title">真正运行于业务中的 AI，<br />不止是一个演示。</h2></header>
        <div className="zen-delivery-layout" data-zen-motion data-zen-motion-delay="70">
          <div className="zen-delivery-cards">{deliveryCards.map((card) => <article key={card.index} className="zen-delivery-card"><p className="zen-label">{card.index} / {card.type}</p><h3>{card.title}</h3><p>{card.features[0]}</p><ul>{card.features.slice(1).map((feature) => <li key={feature}><Check aria-hidden />{feature}</li>)}</ul><a href="#assessment">开始讨论<ArrowRight aria-hidden /></a></article>)}</div>
          <aside className="zen-proof"><p className="zen-label">{deliveryProof.title}</p><div className="zen-proof-metrics">{deliveryProof.metrics.map((metric) => <div key={metric.value}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div><ol>{deliveryProof.principles.map((principle) => <li key={principle.index}><span>{principle.index}</span><p>{principle.title}</p></li>)}</ol></aside>
        </div>
      </section>

      <section id="cases" className="zen-cases" aria-labelledby="cases-title">
        <div className="zen-container">
          <header className="zen-cases-head" data-zen-motion><div><p className="zen-label">{caseSectionCopy.eyebrow}</p><h2 id="cases-title">{caseSectionCopy.title}</h2></div><a href="#assessment" className="zen-link-arrow">{caseSectionCopy.allCasesAction}<ArrowRight aria-hidden /></a></header>
          <div className="zen-case-grid">{logisticsCases.map((item, index) => <article key={item.title} className="zen-case" data-zen-motion data-zen-motion-delay={index * 90}><div className="zen-case-visual" aria-hidden><span className="zen-case-dot" /><span className="zen-case-route" /><span className="zen-case-code">SYSTEM<br />CONNECTED</span></div><p className="zen-label">{item.category}</p><h3>{item.title}</h3><p>{item.summary}</p><strong>{item.metric}</strong><div className="zen-case-quote"><q>{item.quote}</q><span>{item.role}</span></div></article>)}</div>
          <button type="button" className="zen-expand" aria-expanded={expandedCases} onClick={() => setExpandedCases((value) => !value)}>{expandedCases ? "收起扩展内容" : caseSectionCopy.moreContentLabel}<ChevronDown aria-hidden /></button>
          {expandedCases && <div className="zen-case-more"><span>数据接入</span><span>系统现代化</span><span>合规自动化</span><span>语音智能体</span><span>预测运营</span><span>知识工程</span></div>}
        </div>
      </section>

      <section className="zen-voice" aria-labelledby="voice-title">
        <div className="zen-container zen-voice-grid">
          <div className="zen-voice-copy" data-zen-motion><p className="zen-label">{voiceDemoCopy.eyebrow}</p><h2 id="voice-title">{voiceDemoCopy.title}</h2><p>{scenario.description}</p><div className="zen-scenario-switcher" role="tablist" aria-label={voiceDemoCopy.scenarioLabel}>{voiceDemoCopy.scenarios.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={index === scenarioIndex} onClick={() => selectScenario(index)}><span>{item.index}</span>{item.label}</button>)}</div><ul>{scenario.features.map((feature) => <li key={feature}><Check aria-hidden />{feature}</li>)}</ul></div>
          <div className="zen-voice-demo" data-zen-motion="right" data-zen-motion-delay="90"><div className="zen-voice-demo-top"><span>ZENAI VOICE / LIVE</span><span className={playing ? "is-live" : ""}>{playing ? "SAMPLE PLAYING" : "READY"}</span></div><div className="zen-swap-stage zen-voice-stage">{priorScenario && <VoiceStage key={priorScenario.id} scenario={priorScenario} className="zen-swap-layer zen-swap-layer--outgoing" ariaHidden />}{<VoiceStage key={scenario.id} scenario={scenario} className={`zen-swap-layer zen-swap-layer--incoming${incomingScenarioActive ? " is-active" : ""}`} onTransitionEnd={clearPriorScenario} />}</div><button type="button" className="zen-audio-control" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause aria-hidden /> : <CirclePlay aria-hidden />}<span>{playing ? "暂停样本" : voiceDemoCopy.audioHint}</span><span className="zen-audio-bars" aria-hidden><i /><i /><i /></span></button></div>
        </div>
      </section>
    </>
  );
}
