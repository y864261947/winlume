"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, FileText, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Project } from "./ExperienceSurface";

const images = [
  { id: "main", title: "白底主图", source: "/reizo/landing/product-main.jpg" },
  { id: "detail", title: "产品细节", source: "/reizo/landing/product-detail.jpg" },
  { id: "features", title: "功能卖点", source: "/reizo/landing/product-features.jpg" },
];

export default function ProjectDeliverables({ onOpenProject }: { onOpenProject: (project: Project) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  function openProject(project: Project) {
    video.current?.pause();
    onOpenProject(project);
  }
  return <section className="landing-deliverables landing-shell" id="projects" aria-labelledby="deliverables-title">
    <div className="deliverables-heading"><h2 id="deliverables-title">项目里的交付物</h2><p>图片、成片与方案文档留在项目中，沿着原来的资料继续修改。</p></div>
    <div className="deliverables-grid">
      <article className="deliverable-film">
        <div className="deliverable-video">
          <video ref={video} playsInline preload="metadata" poster="/reizo/showcase/film-poster.jpg" aria-label="日常鞋履短片"
            onPlay={() => { setPlaying(true); setVideoError(false); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}>
            <source src="/reizo/showcase/everyday-film.mp4" type="video/mp4" />
          </video>
          <Button variant="outline" size="icon" data-slot="button" className="deliverable-play size-12" aria-label={playing ? "暂停短片" : "播放短片"} onClick={() => {
            const element = video.current;
            if (!element) return;
            if (element.paused) void element.play().catch(() => setVideoError(true));
            else element.pause();
          }}>{playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}</Button>
        </div>
        {videoError && <p role="status" className="deliverable-error">短片暂时无法播放，请重试。</p>}
        <div className="deliverable-caption"><h3>日常鞋履短片</h3><span>00:12 · MP4</span></div>
        <p>产品素材、成片与发布方案，保留在一个项目中。</p>
        <button className="landing-text-link" onClick={() => openProject("film")}>查看短片项目 <ArrowUpRight size={15} /></button>
      </article>
      <article className="deliverable-commerce">
        <Tabs defaultValue="main">
          <div className="deliverable-images">{images.map(item => <TabsContent key={item.id} value={item.id} className="deliverable-image">
            <Image src={item.source} alt={item.title} fill sizes="(max-width: 760px) 90vw, 500px" unoptimized />
          </TabsContent>)}</div>
          <TabsList variant="line" className="deliverable-image-tabs" aria-label="选择商品图片">{images.map(item => <TabsTrigger key={item.id} value={item.id}>{item.title}</TabsTrigger>)}</TabsList>
        </Tabs>
        <div className="deliverable-caption"><h3>商品套图</h3><span>3 张图片</span></div>
        <p>白底主图、产品细节与功能卖点，使用同一份参考素材。</p>
        <button className="landing-text-link" onClick={() => openProject("commerce")}>查看套图项目 <ArrowUpRight size={15} /></button>
      </article>
    </div>
    <article className="deliverable-document"><FileText size={25} strokeWidth={1.5} aria-hidden="true" /><div><h3>发布方案</h3><p>创意方向、分镜与发布节奏，整理成可下载的 Markdown 文档。</p></div><Link className="landing-text-link" href="/reizo/showcase/launch-plan.md" download>下载方案 <ArrowUpRight size={15} /></Link></article>
  </section>;
}
