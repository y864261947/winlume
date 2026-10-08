"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, ListTodo, RefreshCw, CheckCheck, Timer, ChartPie } from "lucide-react";
import { useModals } from "@/components/providers";
import { listProjects, patchSession } from "@/lib/studio/api";
import TaskDashboardInsights, { useDashboardUsage } from "@/components/studio/TaskDashboardInsights";
import { getCapabilityPreset } from "@/lib/studio/capability-presets";
import type { Project } from "@/lib/agent/types";
import { TASK_STATUS_LABELS, type StudioTask } from "@/lib/studio/task-summary";

export default function StudioTasksPage() {
  const { account, accountLoading, openLogin } = useModals();
  const [snapshot, setSnapshot] = useState<{owner:string;tasks:StudioTask[];projects:Project[];error?:string} | null>(null);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const usage = useDashboardUsage(revision);
  const [project, setProject] = useState("all");
  const [moving, setMoving] = useState<string|null>(null);
  const [moveError, setMoveError] = useState("");
  const userId=account?.id;
  useEffect(()=>{
    if(!userId)return;
    let cancelled=false;
    Promise.all([fetch('/api/studio/tasks',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('任务暂时无法同步，请重试。');return (await r.json()).tasks as StudioTask[];}),listProjects()])
      .then(([tasks,projects])=>{if(!cancelled)setSnapshot({owner:userId,tasks,projects});})
      .catch(e=>{if(!cancelled)setSnapshot({owner:userId,tasks:[],projects:[],error:e instanceof Error?e.message:'读取失败'});});
    return()=>{cancelled=true;};
  },[userId,revision]);
  const current=snapshot?.owner===userId?snapshot:null;
  const tasks=current?.tasks??[];
  const loading=accountLoading||!!account&&!current;
  const scoped=tasks.filter(t=>project==='all'||(project==='none'?!t.projectId:t.projectId===project));
  const visible=scoped.filter(t=>(filter==='all'||t.runStatus===filter)&&(category==='all'||(t.capabilityPresetId||'unknown')===category)&&`${t.title} ${t.model}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function move(task:StudioTask,value:string){
    const owner=userId;setMoving(task.id);setMoveError('');
    try {const updated=await patchSession(task.id,{projectId:value||null});setSnapshot(s=>s&&s.owner===owner?{...s,tasks:s.tasks.map(t=>t.id===task.id?{...updated,runStatus:t.runStatus}:t)}:s);window.dispatchEvent(new Event('reizo:sessions-changed'));}
    catch(e){setMoveError(e instanceof Error?e.message:'整理失败，请重试。');}finally{setMoving(null);}
  }
  const ready = !loading && !!account && !current?.error;
  const count = (status: string) => tasks.filter(t => t.runStatus === status).length;
  const refresh = () => { setSnapshot(null); setRevision(n => n + 1); };
  const descriptions: Record<StudioTask["runStatus"], string> = {
    queued: "等待执行名额", running: "正在推进任务", waiting_approval: "等待你确认后继续",
    completed: "任务已完成，可以继续修改", failed: "执行遇到问题，打开对话查看", cancelled: "任务已停止", unknown: "尚无执行状态记录",
  };
  return <div className="review-library review-dashboard">
    <header className="review-heading"><h1>任务看板</h1><button className="review-dashboard-refresh" disabled={!account || loading} onClick={refresh}><RefreshCw size={14}/>刷新</button></header>
    <div className="review-dashboard-metrics">
      {[{status:'all',label:'全部任务',value:tasks.length,Icon:ListTodo},{status:'running',label:'进行中',value:count('running'),Icon:Timer},{status:'completed',label:'已完成',value:count('completed'),Icon:CheckCheck}].map(({status,label,value,Icon})=><button key={status} onClick={()=>setFilter(status)} aria-pressed={filter===status}><span className="review-metric-icon"><Icon size={21}/></span><span><small>{label}</small><strong>{ready?value:'—'}</strong><em>{status==='all'?`待确认 ${ready?count('waiting_approval'):'—'} · 排队中 ${ready?count('queued'):'—'}`:ready?`占全部 ${tasks.length?Math.round(value/tasks.length*100):0}%`:'登录后查看'}</em></span></button>)}
      <Link href="/account/wallet"><span className="review-metric-icon"><ChartPie size={23}/></span><span><small>会员剩余额度</small><strong>{usage.percent===null?'—':`${Math.round(usage.percent)}%`}</strong><em>{usage.allowance?.status==='not_configured'?'尚未开通月度额度':'本期可用'}</em></span></Link>
    </div>
    <div className="review-dashboard-columns"><div className="review-dashboard-work">
      <div className="review-tabs" aria-label="任务状态">{['all','running','waiting_approval','queued','completed','failed','cancelled','unknown'].map(status=><button key={status} aria-pressed={filter===status} onClick={()=>setFilter(status)}>{status==='all'?'全部':TASK_STATUS_LABELS[status as StudioTask['runStatus']]} <small>{ready?(status==='all'?tasks.length:count(status)):'—'}</small></button>)}</div>
      <div className="review-dashboard-filters"><input className="review-search" type="search" aria-label="搜索任务" placeholder="搜索任务名称或模型" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="筛选任务类型" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">全部类型</option>{[...new Set(tasks.map(t=>t.capabilityPresetId||'unknown'))].map(id=><option key={id} value={id}>{getCapabilityPreset(id)?.label||'未分类'}</option>)}</select><select aria-label="筛选项目" value={project} onChange={e=>setProject(e.target.value)}><option value="all">全部项目</option><option value="none">未归属项目</option>{current?.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      {moveError&&<p role="alert" className="review-error">{moveError}</p>}
      {loading||!account||current?.error||!visible.length?<div className="review-empty"><p>{loading?'正在同步任务…':!account?'登录后，在这里继续你的任务':current?.error||'没有符合条件的任务'}</p>{!account?<button className="review-primary" onClick={()=>openLogin()}>登录账户</button>:current?.error?<button onClick={refresh}>重新同步</button>:<button onClick={()=>{setQuery('');setFilter('all');setCategory('all');setProject('all');}}>清除筛选</button>}</div>:
      <div className="review-dashboard-tasks">{visible.map(task=><article key={task.id} className="review-dashboard-task"><span className="review-dashboard-task-icon"><ListTodo size={19}/></span><div className="review-dashboard-task-main"><Link href={`/studio/c/${encodeURIComponent(task.id)}`} className="review-dashboard-task-title">{task.title||'未命名任务'}</Link><span className="review-dashboard-category">{getCapabilityPreset(task.capabilityPresetId)?.label||'未分类'}</span><p>{task.model} · {descriptions[task.runStatus]}</p><div className="review-dashboard-progress" data-status={task.runStatus}><div aria-hidden="true"><i/></div><span>{task.runStatus==='completed'?'已完成':TASK_STATUS_LABELS[task.runStatus]}</span></div><small>更新于 {new Date(task.updatedAt).toLocaleString('zh-CN')}</small></div><div className="review-dashboard-task-actions"><span className="review-task-status" data-status={task.runStatus}><i/>{TASK_STATUS_LABELS[task.runStatus]}</span><Link className="review-dashboard-open" href={`/studio/c/${encodeURIComponent(task.id)}`}>{task.runStatus==='waiting_approval'?'确认方向':task.runStatus==='completed'?'查看成果':'进入对话'} →</Link><label className="review-assign"><FolderKanban size={13}/><select aria-label={`整理「${task.title}」到项目`} disabled={moving!==null} value={task.projectId??''} onChange={e=>void move(task,e.target.value)}><option value="">整理到项目</option>{current?.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div></article>)}</div>}
      <p className="review-footnote">状态来自最近一次执行记录；进行中的任务不估算完成百分比。</p>
    </div><TaskDashboardInsights usage={usage} running={ready?count('running'):null} queued={ready?count('queued'):null}/></div>
  </div>;
}
