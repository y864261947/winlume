"use client";

import Link from "next/link";
import { Activity, CheckCircle2, ChevronDown, FileCog, MoreVertical, RefreshCw, Search, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@/lib/agent/types";

type TaskFilter = "all" | "running" | "queued" | "completed";
type TaskStatus = Exclude<TaskFilter, "all">;

type TaskItem = { session: Session; status: TaskStatus };

const statusCopy: Record<TaskStatus, { label: string; tone: string }> = {
  running: { label: "进行中", tone: "is-running" },
  queued: { label: "排队中", tone: "is-queued" },
  completed: { label: "已完成", tone: "is-completed" },
};

/** Sessions from /api/sessions are finished conversations, not live jobs. */
function toTaskItem(session: Session): TaskItem {
  return { session, status: "completed" };
}

const formatTime = (value: string) => new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AccountTasksContent() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/sessions", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "请先登录后查看任务" : "任务列表暂时不可用");
      const payload = await response.json() as { sessions?: Session[] };
      setSessions(payload.sessions ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "任务列表暂时不可用"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const tasks = useMemo(() => sessions.map(toTaskItem), [sessions]);
  const counts = useMemo(() => ({
    all: tasks.length,
    running: tasks.filter((task) => task.status === "running").length,
    queued: tasks.filter((task) => task.status === "queued").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  }), [tasks]);
  const visible = useMemo(() => tasks.filter((task) => {
    const matchesFilter = filter === "all" || task.status === filter;
    const haystack = `${task.session.title} ${task.session.model}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  }), [filter, query, tasks]);
  const recentDone = tasks.filter((task) => task.status === "completed").slice(0, 3);
  const filters: Array<{ id: TaskFilter; label: string }> = [
    { id: "all", label: `全部 ${counts.all}` },
    { id: "running", label: `进行中 ${counts.running}` },
    { id: "queued", label: `排队中 ${counts.queued}` },
    { id: "completed", label: `已完成 ${counts.completed}` },
  ];

  return (
    <div className="account-task-board">
      <header className="account-task-board-head">
        <div><p>用户中心 / 任务看板</p><h1>任务看板</h1><span>工作台发出的会话会出现在这里</span></div>
        <button type="button" onClick={() => void load()}><RefreshCw aria-hidden />刷新</button>
      </header>

      <section className="account-task-summary" aria-label="任务概览">
        <article><span className="account-task-summary-icon"><FileCog aria-hidden /></span><div><small>全部任务</small><strong>{counts.all}</strong><p>进行中 {counts.running} · 排队中 {counts.queued} · 已完成 {counts.completed}</p></div></article>
        <article><span className="account-task-summary-icon"><Activity aria-hidden /></span><div><small>进行中任务</small><strong>{counts.running}</strong><p>以工作台真实状态为准</p></div></article>
        <article><span className="account-task-summary-icon is-green"><CheckCircle2 aria-hidden /></span><div><small>已完成任务</small><strong>{counts.completed}</strong><p>{counts.all ? `占全部 ${Math.round((counts.completed / counts.all) * 100)}%` : "还没有任务"}</p></div></article>
      </section>

      <div className="account-task-board-layout">
        <main>
          <div className="account-task-board-filters">
            <div className="account-task-filter-tabs" role="tablist" aria-label="任务状态筛选">
              {filters.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={filter === item.id ? "is-active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}
            </div>
            <div className="account-task-filter-tools"><label><Search aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名称或关键词" /></label></div>
          </div>

          {loading ? <p className="account-task-empty">正在同步任务…</p> : error ? <p className="account-task-empty">{error}</p> : visible.length === 0 ? <div className="account-task-empty"><Workflow aria-hidden /><strong>还没有任务</strong><span>工作台发一条就会出现在这里</span><Link href="/studio">进入工作台</Link></div> : (
            <div className="account-task-board-list">
              {visible.map((task) => {
                const state = statusCopy[task.status];
                return <article key={task.session.id} className={`account-task-board-item ${state.tone}`}>
                  <span className="account-task-board-item-icon"><Workflow aria-hidden /></span>
                  <div className="account-task-board-item-body"><div className="account-task-board-item-title"><strong>{task.session.title || "未命名任务"}</strong><em>{task.session.model || "工作台"}</em></div><p>来自工作台的会话</p><small>更新时间：{formatTime(task.session.updatedAt)}</small></div>
                  <div className="account-task-board-item-side"><em className={state.tone}>{state.label}</em><button type="button" aria-label="更多任务操作"><MoreVertical aria-hidden /></button><Link href={`/studio?session=${encodeURIComponent(task.session.id)}`}>查看会话<ChevronDown aria-hidden /></Link></div>
                </article>;
              })}
            </div>
          )}
        </main>

        <aside className="account-task-insights">
          <section className="account-task-recent"><div className="account-task-insight-head"><h2>最近完成的任务</h2></div>{recentDone.length ? recentDone.map((task) => <Link href={`/studio?session=${encodeURIComponent(task.session.id)}`} key={task.session.id}><CheckCircle2 aria-hidden />{task.session.title}<span>{formatTime(task.session.updatedAt).slice(-5)}</span></Link>) : <p>工作台发一条就会出现在这里</p>}</section>
        </aside>
      </div>
    </div>
  );
}
