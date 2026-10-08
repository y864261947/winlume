"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import SkillWaterfall from "@/components/studio/SkillWaterfall";
import StudioCatalogFilter from "@/components/studio/StudioCatalogFilter";
import LibraryArtwork from "@/components/studio/LibraryArtwork";
import { getStudioToolCategory, isStudioToolCategoryId } from "@/lib/studio/tool-categories";
import { studioToolHref } from "@/lib/studio/studio-mode";
import { listStudioTools } from "@/lib/studio/tool-catalog";
import { libraryTaskHref, REVIEW_ROLES, REVIEW_STARTERS } from "@/lib/studio/review-library";

function ToolsCatalog() {
  const params = useSearchParams();
  const raw = params.get("catalog") ?? "all";
  const catalog = isStudioToolCategoryId(raw) ? raw : "all";
  const [tab, setTab] = useState("tools");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Array<{ id: string; name: string }>>([]);
  const entries = [
    ...listStudioTools().map(tool => ({ ...tool, href: studioToolHref(tool.id), artwork: tool.id === "ecommerce-image-set" ? "commerce" : "" })),
    ...REVIEW_STARTERS.map(starter => ({ ...starter, id: starter.name, href: libraryTaskHref(starter.prompt) })),
  ].filter(item => (catalog === "all" || item.category === catalog) && `${item.name} ${item.summary}`.toLowerCase().includes(query.toLowerCase()));
  const roles = REVIEW_ROLES.filter(role => (catalog === "all" || role.category === catalog) && `${role.name} ${role.note}`.includes(query.trim()));
  return <div className="review-library">
    <header className="review-heading"><h1>工具与技能</h1>{selected.length > 0 && <Link className="review-library-selection" href={libraryTaskHref("", selected.map(skill => skill.id))}>带入任务 · {selected.length} 项能力 →</Link>}</header>
    <div className="review-toolbar"><div className="review-tabs" aria-label="工具类型">{[["tools", "任务工具"], ["roles", "角色"], ["skills", "技能"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div><input className="review-search" aria-label="搜索工具与技能" placeholder="搜索你想完成的事" type="search" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <StudioCatalogFilter active={catalog} />
    {selected.length > 0 && <div className="review-selected-skills" aria-label="已选技能">{selected.map(skill => <button key={skill.id} onClick={() => setSelected(items => items.filter(item => item.id !== skill.id))} aria-label={`移除${skill.name}`}>{skill.name} ×</button>)}<small>最多选择 10 项</small></div>}
    {tab === "skills" ? <SkillWaterfall catalog={catalog} query={query} selectedIds={selected.map(skill => skill.id)} onToggleSkill={skill => setSelected(items => items.some(item => item.id === skill.id) ? items.filter(item => item.id !== skill.id) : items.length < 10 ? [...items, { id: skill.id, name: skill.name }] : items)} /> : tab === "roles" ? <div className="review-role-grid">{roles.map(role => <article className="review-role-card" key={role.id}><div className="review-role-heading"><span className="review-role-avatar">{role.initial}</span><div><small>{getStudioToolCategory(role.category)?.name}</small><h2>{role.name}</h2></div></div><p>{role.note}</p><div className="review-role-bottom"><small>{role.deliver}</small><Link href={libraryTaskHref(role.prompt, selected.map(skill => skill.id))}>使用角色 ↗</Link></div></article>)}{!roles.length && <p className="review-empty">没有匹配的角色。</p>}</div> : <div className="studio-catalog-grid review-tool-grid">{entries.map(tool => { const category = getStudioToolCategory(tool.category); const Icon = category?.icon; return <Link key={tool.id} href={tool.href} className={`studio-catalog-card review-designed-tool${tool.artwork ? " has-artwork" : ""}`}>{tool.artwork ? <LibraryArtwork kind={tool.artwork} /> : <span className="studio-catalog-mark">{Icon && <Icon size={19} />}</span>}<div className="review-tool-body"><small>{category?.name}</small><h2>{tool.name}</h2><p>{tool.summary}</p><span className="review-card-action">开始任务 <ArrowRight size={14} /></span></div></Link>; })}{!entries.length && <div className="review-empty">没有匹配的工具，试试其他分类或关键词。</div>}</div>}
  </div>;
}
export default function StudioToolsPage() { return <Suspense fallback={<div className="review-empty">正在加载工具…</div>}><ToolsCatalog /></Suspense>; }
