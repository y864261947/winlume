"use client";

import Image from "next/image";
import { useState } from "react";
import { Download, FileText, Film, ImageIcon, Table2 } from "lucide-react";
import type { Outcome } from "./showcase-scenes";

export default function OutcomePreview({ file, progress = 1, onInteract }: { file: Outcome; progress?: number; onInteract?: () => void }) {
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const complete = progress >= 1;
  if (file.kind === "image") return <figure className="outcome-source-image"><Image src={file.href!} alt="日常鞋履产品图：木质桌面上的白色系带鞋" width={1280} height={720} unoptimized /><figcaption><span>起始素材 · 产品图</span><strong>{file.title}</strong><small>{complete ? "已提取产品特征，继续编写脚本与分镜" : "观察鞋履轮廓、鞋面材质与自然光线"}</small></figcaption></figure>;
  if (file.kind === "gallery") {
    const images = file.images ?? [];
    const generated = complete ? images.length : Math.floor(progress * images.length);
    return <div className="outcome-gallery">{images.map((photo, index) => <figure key={photo.src} data-generated={index < generated} data-generating={index === generated}>
      {index < generated ? <><Image src={photo.src} alt={photo.title} width={400} height={520} unoptimized /><a className="outcome-image-download" href={photo.src} download onClick={onInteract} aria-label={`下载${photo.title}`}><Download size={14} /></a></> : <div className="outcome-image-pending"><ImageIcon size={21} /><span>{index === generated ? "正在生成" : `0${index + 1}`}</span></div>}
      <figcaption>{photo.title}{index < generated && <span> JPG</span>}</figcaption>
    </figure>)}</div>;
  }
  if (file.kind === "video") return <div className="outcome-film">{complete ? <video controls playsInline preload="none" poster="/reizo/showcase/film-poster.jpg" onPlay={onInteract} aria-label="日常鞋履发布短片"><source src={file.href} type="video/mp4" /></video> : <div className="outcome-film-pending"><Film size={32} /><strong>脚本与分镜已完成</strong><span>正在按镜头顺序合成视频</span><div className="outcome-item-progress"><i style={{ transform: `scaleX(${progress})` }} /></div><small>{Math.round(progress * 100)}%</small></div>}<p>{file.title}<span>{complete ? "成片已就绪 · 点击播放" : "产品图 → 脚本与分镜 → 视频成片"}</span></p></div>;
  if (file.kind === "sheet") {
    const rows = file.rows ?? [];
    const shown = complete ? rows.length : Math.floor(progress * (rows.length + 1));
    return <div className="outcome-sheet"><div className="sheet-formula"><span>fx</span><span>{file.formula || file.title}</span></div><div className="sheet-scroll"><table><thead><tr><th aria-label="行号" />{file.headings?.map((_, i) => <th key={i}>{String.fromCharCode(65 + i)}</th>)}</tr></thead><tbody><tr><th>6</th>{file.headings?.map(h => <th key={h}>{h}</th>)}</tr>{rows.map((row, i) => <tr key={i} data-written={i < shown}><th>{i + 7}</th>{row.map((cell, j) => <td key={j}>{i < shown ? cell : <span className="outcome-cell-pending" />}</td>)}</tr>)}</tbody></table></div><div className="sheet-bottom"><Table2 size={14} />工作表<span>{complete ? "与下载文件的计算结果一致" : `正在写入 ${Math.min(shown, rows.length)} / ${rows.length} 行`}</span></div></div>;
  }
  if (file.pages?.length) {
    const available = complete ? file.pages.length : Math.max(1, Math.ceil(progress * file.pages.length));
    const page = selectedPage ?? (complete ? 0 : available - 1);
    return <div className={`outcome-pages ${file.kind === "slides" ? "is-deck" : "is-word"}`}><div className="outcome-page-scroll"><Image key={page} src={file.pages[page]} alt={file.pageTitles?.[page] || `${file.title} 第 ${page + 1} 页`} width={file.kind === "slides" ? 1280 : 900} height={file.kind === "slides" ? 720 : 1273} unoptimized /></div><div className="outcome-page-tabs" aria-label="选择文件页面">{file.pages.map((_, i) => <button type="button" key={i} aria-pressed={page === i} disabled={i >= available} onClick={() => { setSelectedPage(i); onInteract?.(); }} aria-label={`第 ${i + 1} 页${file.pageTitles?.[i] ? ` ${file.pageTitles[i]}` : ""}`}>{i + 1}</button>)}<span>{complete ? "从原文件渲染" : `正在生成第 ${available} 页`}</span></div></div>;
  }
  if (file.kind === "chart") return <div className="outcome-chart-file"><Image src={file.href!} alt="上半年有效线索趋势图，6月合计690条，人工构造的示例数据" width={1000} height={650} unoptimized /><span>{complete ? "SVG 图表 · 可下载" : "绘制坐标、趋势线与统计说明"}</span></div>;
  if (file.kind === "code") return <div className="outcome-web-file"><div className="website-address"><i /><i /><i /><span>山麓酒庄 · 实际 HTML 页面</span>{complete && <a href={file.href} target="_blank" rel="noreferrer" onClick={onInteract}>打开 ↗</a>}</div>{complete ? <iframe title="山麓酒庄网站交付预览" src={file.href} sandbox="allow-scripts" loading="lazy" /> : <div className="outcome-code-draft"><code>{`<!doctype html>\n<html lang="zh-CN">\n  <header>山麓 WINERY</header>\n  <main>\n    <section id="story">产地故事</section>\n${progress > .35 ? '    <section id="wines">三款酒品与风味介绍</section>\n' : ''}${progress > .65 ? '    <form>到访日期与联系信息</form>\n' : ''}  </main>\n</html>`}</code></div>}</div>;
  const sections = file.sections ?? [];
  const count = complete ? sections.length : Math.ceil(progress * sections.length);
  return <article className={`outcome-document ${file.type === "TXT" || file.type === "TSX" ? "is-plain" : ""}`}><div className="document-meta"><span><FileText size={12} />{file.type === "MD" ? "Markdown" : file.type}</span><span>完整文件预览</span></div><h3>{file.title}</h3>{sections.length ? sections.slice(0, count).map(([heading, paragraph]) => <section className="outcome-text-section" key={heading}><h4>{heading}</h4><p>{paragraph}</p></section>) : <pre>{complete ? file.body : file.body?.slice(0, Math.floor(file.body.length * progress))}</pre>}<footer>REIZO 演示项目 · 虚构样例</footer></article>;
}
