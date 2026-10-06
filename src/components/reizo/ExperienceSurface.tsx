"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

export type Project = "film" | "commerce";
export type Experience = { project: Project; view?: "canvas" };
export const projectNames: Record<Project, string> = { film: "日常鞋履短片", commerce: "电商套图" };
const validProject = (value: unknown): value is Project => value === "film" || value === "commerce";

export function ExperienceFrame({ project, view, active = true, onProjectChange }: Experience & {
  active?: boolean;
  onProjectChange?: (project: Project) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [initialUrl] = useState(() => `/reizo/experience/index.html?project=${project}${view ? `&view=${view}` : ""}`);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestProject = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "reizo-experience-open-project", project, view }, window.location.origin);
  }, [project, view]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1280));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "reizo-experience-ready") {
        setReady(true);
        setFailed(false);
        if (timeout.current) clearTimeout(timeout.current);
        requestProject();
      } else if (event.data?.type === "reizo-experience-project" && validProject(event.data.project)) {
        onProjectChange?.(event.data.project);
      }
    };
    window.addEventListener("message", receive);
    requestProject();
    return () => window.removeEventListener("message", receive);
  }, [onProjectChange, requestProject]);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);

  return <div ref={host} className="experience-host" data-fluid={view === "canvas"} data-ready={ready} aria-busy={!ready}>
    {active && <iframe key={retry} ref={frame} src={initialUrl} title={`${projectNames[project]} · REIZO 项目样例`}
      loading="lazy" sandbox="allow-scripts allow-same-origin allow-downloads"
      onLoad={() => {
        frame.current?.contentWindow?.postMessage({ type: "reizo-experience-host-ready" }, window.location.origin);
        requestProject();
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = setTimeout(() => setFailed(true), 15000);
      }}
      style={view === "canvas" ? { width: "100%", height: "100%" } : { width: 1280, height: 720, transform: `scale(${scale})` }} />}
    <div className="experience-poster" aria-hidden="true"><picture><source media="(max-width: 760px)" srcSet={`/reizo/landing/sample-${project}${view === "canvas" ? "-canvas" : ""}-mobile.jpg?v=cases-2`} /><Image src={`/reizo/landing/sample-${project}${view === "canvas" ? "-canvas" : ""}.jpg?v=cases-2`} alt="" fill sizes="(max-width: 760px) 100vw, 1280px" unoptimized /></picture></div>
    {failed && !ready && <div className="experience-failure" role="status"><span>工作台加载失败</span><button onClick={() => { setFailed(false); setReady(false); setRetry(n => n + 1); }}>重试 <RotateCcw size={14} /></button></div>}
  </div>;
}

export default function ExperienceSurface({ project, active = true, onProjectChange }: {
  project: Project;
  active?: boolean;
  onProjectChange: (project: Project) => void;
}) {
  return <div className="hero-experience" id="workspace">
    <ExperienceFrame project={project} active={active} onProjectChange={onProjectChange} />
  </div>;
}
