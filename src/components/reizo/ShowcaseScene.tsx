"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Download, FileText, Pause, Play, RotateCcw, Sparkles, X, Maximize2, Table2, Presentation, ChartNoAxesCombined, Code2, Images, Film } from "lucide-react";
import { type ShowcaseScene as Scene } from "./showcase-scenes";
import { artifactProgress, getShowcaseTimeline } from "./showcase-timeline";
import OutcomePreview from "./OutcomePreview";

const icons = { image: Images, gallery: Images, video: Film, sheet: Table2, document: FileText, slides: Presentation, chart: ChartNoAxesCombined, code: Code2 };
const sizeLabel = (bytes = 0) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function ShowcaseScene({ scene, reduced, visible, elapsed, paused, onPauseChange, onRestart, onInteract }: { scene: Scene; reduced: boolean; visible: boolean; elapsed: number; paused: boolean; onPauseChange: (paused: boolean) => void; onRestart: () => void; onInteract: () => void }) {
  const timeline = useMemo(() => getShowcaseTimeline(scene.files), [scene.files]);
  const end = timeline.at(-1)!.end;
  const [selected, setSelected] = useState<number | null>(null);
  const [replay, setReplay] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const clock = reduced ? end : elapsed;
  const complete = clock >= end;
  const done = timeline.filter(item => clock >= item.end).length;
  const generating = Math.min(done, scene.files.length - 1);
  const fileIndex = selected ?? (complete ? scene.completedFileIndex ?? 0 : generating);
  const file = scene.files[fileIndex];
  const progress = artifactProgress(clock, timeline[fileIndex]);
  const ready = progress >= 1;
  const Icon = icons[file.kind];

  const inspect = onInteract;
  const restart = () => { onRestart(); setSelected(null); setReplay(value => value + 1); };
  const activeLabel = complete ? "全部成果已生成" : scene.files[generating].kind === "image" ? "读取产品图，识别材质、轮廓与光线" : clock < timeline[0].start ? "分析需求与交付清单" : `正在生成 ${scene.files[generating].name}`;

  return <>
    <div className="outcome-stage" data-paused={paused || !visible} data-progress={clock / end} role="tabpanel" id="outcome-panel" aria-labelledby={`outcome-tab-${scene.id}`}>
      <aside className="outcome-conversation">
        <div className="outcome-agent"><Image src="/reizo/assets/reizo-mark.png" alt="" width={22} height={22} unoptimized /><b>REIZO</b><span>任务回放</span></div>
        <h2>{scene.title}</h2><p className="outcome-prompt">{scene.prompt}</p>
        <div className="outcome-process-heading"><Sparkles size={14} /><span>{complete ? "交付完成" : "按顺序生成成果"}</span><small>{done} / {scene.files.length}</small></div>
        <ol className="outcome-steps">{scene.files.map((item, i) => {
          const p = artifactProgress(clock, timeline[i]);
          const current = i === generating && !complete;
          return <li key={item.name} data-done={p >= 1} data-current={current}><span>{p >= 1 ? <Check size={13} /> : current ? <i /> : i + 1}</span><div><b>{item.name}</b><small>{p >= 1 ? `${item.detail || item.type} · ${item.kind === "image" ? "已读取" : "已生成"}` : current ? item.kind === "image" ? "产品图已提供 · 正在读取素材" : item.kind === "video" ? `脚本与分镜已完成 · 正在合成 ${Math.round(p * 100)}%` : item.kind === "gallery" ? `正在生成第 ${Math.min(6, Math.floor(p * 6) + 1)} / 6 张图片` : `正在写入内容 · ${Math.round(p * 100)}%` : "等待上一项完成"}</small>{current && <div className="outcome-item-progress"><i style={{ transform: `scaleX(${p})` }} /></div>}</div></li>;
        })}</ol>
        <p className="outcome-summary" data-visible={complete}>{scene.summary}</p>
        <div className="outcome-conversation-foot"><span role="status">{complete ? `${scene.files.length} 项成果可预览、下载` : paused ? "回放已暂停" : "正在回放生成过程"}</span><div>{!complete && !reduced && <button type="button" onClick={() => onPauseChange(!paused)} aria-label={paused ? "继续任务回放" : "暂停任务回放"}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>}<button type="button" onClick={restart} aria-label="重新播放任务过程"><RotateCcw size={14} /></button></div></div>
        <a className="outcome-start" href="/studio">开始我的任务<ArrowUpRight size={15} /></a>
      </aside>
      <div className="outcome-results">
        <div className="outcome-file-heading"><span><Icon size={17} /><b>{file.name}</b></span><div>{ready && <><a href={file.href} download={file.kind === "gallery" ? "春夏系列视觉.zip" : file.name} onClick={inspect} aria-label={`下载 ${file.name}`}><Download size={15} /><span>下载</span></a><button type="button" onClick={() => { inspect(); setDialogOpen(true); dialog.current?.showModal(); }} aria-label={`放大预览 ${file.name}`}><Maximize2 size={16} /></button></>}</div></div>
        <div className="outcome-preview" key={`${file.name}-${replay}`} data-ready="true" data-generating={!ready}><OutcomePreview file={file} progress={progress} onInteract={inspect} /></div>
        <div className="outcome-generation-status"><span className={complete ? "is-complete" : ""}>{complete ? <Check size={13} /> : <Sparkles size={13} />}{paused && !complete ? "回放已暂停，可继续查看已生成成果" : activeLabel}</span><small>{ready ? sizeLabel(file.bytes) : `${Math.round(progress * 100)}%`}</small></div>
        <div className="outcome-files" aria-label="查看成果">{scene.files.map((item, index) => {
          const FileIcon = icons[item.kind];
          const available = clock >= timeline[index].end;
          return <button type="button" key={item.name} aria-pressed={index === fileIndex} disabled={!available} data-complete={available} onClick={() => { inspect(); setSelected(index); }}><FileIcon size={18} /><span><b>{item.name}</b><small>{available ? `${item.type} · ${sizeLabel(item.bytes)}` : index === generating ? "生成中…" : "等待生成"}</small></span>{available && <Check size={13} />}</button>;
        })}</div>
      </div>
    </div>
    <dialog ref={dialog} className="outcome-dialog" aria-label={`成果预览：${file.name}`} onClose={() => { dialog.current?.querySelectorAll("video").forEach(video => video.pause()); setDialogOpen(false); }} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <header><strong>{file.name}</strong><a href={file.href} download={file.kind === "gallery" ? "春夏系列视觉.zip" : file.name}><Download size={15} />下载原文件</a><button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="关闭成果预览"><X size={20} /></button></header>
      {dialogOpen && <OutcomePreview key={file.name} file={file} onInteract={onInteract} />}
    </dialog>
  </>;
}
