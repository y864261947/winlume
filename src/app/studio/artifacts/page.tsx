"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clapperboard,
  FileCode2,
  FileJson,
  FileText,
  FolderKanban,
  LoaderCircle,
  PanelsTopLeft,
  RefreshCw,
  Table2,
} from "lucide-react";
import type { Artifact, ArtifactKind } from "@/lib/agent/types";
import { StudioApiError, withUserHeaders } from "@/lib/studio/api";
import { useModals } from "@/components/providers";
import ArtifactPreview from "@/components/studio/ArtifactPreview";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  video: "参考视频",
  "video-analysis": "视频拆解",
  binary: "二进制",
  canvas: "画布",
  sheet: "表格",
};

function KindIcon({ kind }: { kind: ArtifactKind }) {
  const cls = "h-4 w-4 shrink-0 text-primary-500";
  if (kind === "json") return <FileJson className={cls} />;
  if (kind === "html") return <FileCode2 className={cls} />;
  if (kind === "canvas") return <PanelsTopLeft className={cls} />;
  if (kind === "sheet") return <Table2 className={cls} />;
  if (kind === "video" || kind === "video-analysis") {
    return <Clapperboard className={cls} />;
  }
  return <FileText className={cls} />;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function StudioArtifactsPage() {
  const { account } = useModals();
  // Discard private previews and pending state whenever the signed-in identity changes.
  return <StudioArtifactsContent key={account?.id ?? "anonymous"} />;
}

function StudioArtifactsContent() {
  const { account, accountLoading, openLogin } = useModals();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [filter, setFilter] = useState("全部");
  const group = (kind: ArtifactKind) => ["image", "video", "video-analysis", "canvas"].includes(kind) ? "视觉方案" : ["html", "json"].includes(kind) ? "代码" : "分析文档";
  const filteredArtifacts = artifacts.filter(artifact => filter === "全部" || group(artifact.kind) === filter);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/artifacts", {
        headers: withUserHeaders(),
        credentials: "same-origin",
      });
      if (res.status === 401) {
        throw new StudioApiError("请先登录", 401);
      }
      if (!res.ok) {
        throw new Error("加载作品失败");
      }
      const data = (await res.json()) as { artifacts: Artifact[] };
      const list = data.artifacts ?? [];
      setArtifacts(list);
      setSelectedId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        return null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountLoading) return;
    if (!account) {
      setLoading(false);
      setError("请先登录后查看作品");
      setArtifacts([]);
      return;
    }
    void load();
  }, [account, accountLoading, load]);

  useEffect(() => {
    if (!selectedId || !account) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/artifacts/${encodeURIComponent(selectedId)}`, {
          headers: withUserHeaders(),
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("读取内容失败");
        const data = (await res.json()) as { content?: string };
        if (!cancelled) setContent(data.content ?? "");
      } catch {
        if (!cancelled) setContent(null);
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, account]);

  const selected = useMemo(
    () => artifacts.find((a) => a.id === selectedId) ?? null,
    [artifacts, selectedId],
  );

  return (
    <div className="review-library review-artifacts">
      <header className="review-heading"><h1>我的成果</h1><button className="review-text-link" disabled={loading||!account} onClick={()=>void load()}><RefreshCw size={15}/>刷新</button></header>
      <div className="review-tabs" aria-label="成果类型">{["全部", "视觉方案", "分析文档", "代码"].map(kind => <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}</div>
      {accountLoading||loading?<div className="review-empty"><LoaderCircle className="animate-spin"/>正在加载成果…</div>:error?<div className="review-empty"><p>{error}</p><button className="review-primary" onClick={()=>account?void load():openLogin('login')}>{account?'重试':'登录账户'}</button></div>:!artifacts.length?<div className="review-empty"><FolderKanban size={30}/><h2>成果将在这里汇集</h2><p>完成对话、工具任务或画布创作后，保存的成果会出现在这里。</p><Link className="review-primary" href="/studio">开始一个任务 ↗</Link></div>:<div className="review-results-grid">{filteredArtifacts.map(a=><article key={a.id} className="review-deliverable">
        <button className="review-deliverable-preview" type="button" aria-label={`预览${a.name}`} onClick={()=>{setContent(null);setContentLoading(true);setSelectedId(a.id);}}>
          {a.kind==='image'&&a.status!=='pending'&&a.status!=='failed'?
            // Authenticated, same-origin artifact media; do not proxy private images through the image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/artifacts/${encodeURIComponent(a.id)}/raw`} alt={a.name} loading="lazy"/>:
            <div className="review-document-art"><KindIcon kind={a.kind}/><i/><i/><i/><span>{KIND_LABELS[a.kind]??a.kind}</span></div>}
        </button><div className="review-deliverable-info"><small>{KIND_LABELS[a.kind]} · {formatTime(a.createdAt)}</small><h2>{a.name}</h2><div><button className="review-text-link" onClick={()=>{setContent(null);setContentLoading(true);setSelectedId(a.id);}}>打开成果 ↗</button>{a.sessionId&&!a.sessionId.startsWith('tool:')&&<Link className="review-text-link" href={`/studio/c/${encodeURIComponent(a.sessionId)}`}>来源任务</Link>}</div></div>
      </article>)}</div>}
      {!loading && !error && artifacts.length > 0 && filteredArtifacts.length === 0 && <div className="review-empty">暂无此类成果，可切换其他分类查看。</div>}
      <Dialog open={!!selected&&!!account} onOpenChange={open=>{if(!open){setSelectedId(null);setContent(null);}}}><DialogContent className="review-artifact-dialog"><DialogTitle>{selected?.name??'成果预览'}</DialogTitle><DialogDescription>预览、下载或返回来源任务继续完善。</DialogDescription><ArtifactPreview artifact={selected} content={content} loading={contentLoading} onRefresh={()=>void load()} className="min-h-0 flex-1"/></DialogContent></Dialog>
    </div>
  );
}
