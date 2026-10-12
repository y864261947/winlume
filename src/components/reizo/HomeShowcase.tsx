"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { showcaseScenes } from "./showcase-scenes";
import SceneContent from "./ShowcaseScene";
import { getShowcaseTimeline, SHOWCASE_COMPLETION_HOLD } from "./showcase-timeline";
import "./home-showcase.css";
export default function HomeShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [docked, setDocked] = useState(false);
  const root = useRef<HTMLElement>(null);
  const navigationSlot = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement|null)[]>([]);
  const [cycle, setCycle] = useState(0);
  const timeline = useMemo(() => getShowcaseTimeline(showcaseScenes[active].files), [active]);
  const end = timeline.at(-1)!.end;
  const progress = reduced ? 1 : Math.min(1, elapsed / end);
  const complete = progress >= 1;
  useEffect(() => {
    if (reduced || paused || !visible || complete) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const delta = now - previous;
      previous = now;
      setElapsed(current => Math.min(end, current + delta));
    }, 40);
    return () => clearInterval(timer);
  }, [reduced, paused, visible, end, cycle, complete]);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!root.current || !navigationSlot.current) return;
      const slot = navigationSlot.current.getBoundingClientRect();
      const section = root.current.getBoundingClientRect();
      const headerBottom = root.current.closest('.reizo-site')?.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
      setDocked(slot.bottom <= Math.max(0, headerBottom) && section.bottom > 160);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    if (root.current) observer.observe(root.current);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)");
    const update=()=>setReduced(media.matches); update();media.addEventListener("change",update);
    const observer=new IntersectionObserver(([entry])=>{setVisible(entry.isIntersecting && !document.hidden);if(entry.isIntersecting)setEntered(true);},{threshold:.2});
    if(root.current)observer.observe(root.current);
    const visibility=()=>{if(document.hidden)setVisible(false);else if(root.current){const r=root.current.getBoundingClientRect();setVisible(r.bottom>0&&r.top<innerHeight);}};
    document.addEventListener("visibilitychange",visibility);
    return()=>{media.removeEventListener("change",update);observer.disconnect();document.removeEventListener("visibilitychange",visibility);};
  },[]);
  const select=useCallback((index:number)=>{
    setActive(index);setCycle(c=>c+1);setPaused(false);setElapsed(0);
    const tab=tabs.current[index];
    if(tab?.parentElement){const list=tab.parentElement;list.scrollTo({left:tab.offsetLeft-list.offsetLeft-(list.clientWidth-tab.clientWidth)/2,behavior:reduced?"instant":"smooth"});}
  }, [reduced]);
  useEffect(() => {
    if (progress < 1 || paused || !visible || reduced) return;
    const timer = setTimeout(() => select((active + 1) % showcaseScenes.length), SHOWCASE_COMPLETION_HOLD);
    return () => clearTimeout(timer);
  }, [progress, paused, visible, reduced, active, select]);
  const onKey=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    const keys=["ArrowLeft","ArrowRight","Home","End"];if(!keys.includes(event.key))return;
    event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?showcaseScenes.length-1:(index+(event.key==="ArrowRight"?1:-1)+showcaseScenes.length)%showcaseScenes.length;
    select(next);tabs.current[next]?.focus({preventScroll:true});tabs.current[next]?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});
  };
  return <section ref={root} className="home-outcomes shell" id="workspace" aria-label="八类任务与成果演示">
    <div ref={navigationSlot} className="outcome-navigation-slot"><div className="outcome-navigation" data-docked={docked}><div className="outcome-tabs" role="tablist" aria-label="选择工作场景">{showcaseScenes.map((scene,index)=><button type="button" key={scene.id} ref={el=>{tabs.current[index]=el;}} role="tab" id={`outcome-tab-${scene.id}`} aria-controls="outcome-panel" aria-selected={active===index} tabIndex={active===index?0:-1} onClick={()=>select(index)} onKeyDown={e=>onKey(e,index)}><span>{scene.label}</span>{active===index&&<svg key={cycle} className="outcome-progress" data-progress={progress} viewBox="0 0 20 20" aria-hidden="true"><circle className="progress-track" cx="10" cy="10" r="8"/><circle className="progress-fill" cx="10" cy="10" r="8" style={{strokeDashoffset:50.27 * (1 - progress)}}/></svg>}</button>)}</div></div></div>
    {entered || cycle>0 ? <SceneContent key={`${active}-${cycle}`} scene={showcaseScenes[active]} reduced={reduced} visible={visible} elapsed={elapsed} paused={paused} onPauseChange={setPaused} onRestart={()=>{setElapsed(0);setPaused(false);setCycle(c=>c+1);}} onInteract={()=>setPaused(true)}/> : <div className="outcome-stage-placeholder"><Sparkles size={24}/><span>从一个想法，到一份成果。</span></div>}
    <div className="outcome-caption"><span>示例任务回放 · 业务数据为虚构样例</span><span>文件可预览、下载 <ArrowUpRight size={12}/></span></div>
  </section>;
}
