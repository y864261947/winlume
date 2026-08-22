"use client";

import Link from "next/link";
import { CheckCircle2, Clock3, RefreshCw, Search, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@/lib/agent/types";

export default function AccountTasksContent() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt] = useState(() => Date.now());
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
  const visible = useMemo(() => sessions.filter((session) => `${session.title} ${session.model}`.toLowerCase().includes(query.toLowerCase())), [sessions, query]);
  const recent = sessions.filter((session) => loadedAt - new Date(session.updatedAt).getTime() < 7 * 86400000).length;

  return (
    <div className="account-tasks">
      <header><div><p>用户中心 / 任务进度</p><h1>任务进度</h1><span>查看工作台任务与最近活动</span></div><button type="button" onClick={() => void load()}><RefreshCw aria-hidden />刷新</button></header>
      <div className="account-task-stats">
        <article><Workflow aria-hidden /><span>全部任务</span><strong>{sessions.length}</strong><small>工作台会话</small></article>
        <article><Clock3 aria-hidden /><span>最近活跃</span><strong>{recent}</strong><small>近 7 天更新</small></article>
        <article><CheckCircle2 aria-hidden /><span>可继续任务</span><strong>{sessions.length}</strong><small>随时回到工作台</small></article>
      </div>
      <div className="account-task-toolbar"><Search aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名称或模型" /></div>
      {loading ? <p className="account-task-empty">正在同步任务…</p> : error ? <p className="account-task-empty">{error}</p> : visible.length === 0 ? <div className="account-task-empty"><Workflow aria-hidden /><strong>还没有任务</strong><span>进入 Agent 工作台创建第一个任务。</span><Link href="/studio">开始创作</Link></div> : (
        <div className="account-task-list">{visible.map((session) => <article key={session.id}><span className="account-task-icon"><Workflow aria-hidden /></span><div><strong>{session.title}</strong><span>{session.model} · 更新于 {new Date(session.updatedAt).toLocaleString("zh-CN")}</span></div><em>可继续</em><Link href={`/studio?session=${encodeURIComponent(session.id)}`}>继续任务</Link></article>)}</div>
      )}
    </div>
  );
}
