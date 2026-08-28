"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3, BriefcaseBusiness, ChevronRight, Code2, FileText, ImageIcon,
  Megaphone, Presentation, Search, ShoppingCart, Sparkles, Video, X,
} from "lucide-react";

type ToolCategory = "内容与营销" | "视觉与媒体" | "电商与销售" | "财务与法务" | "产品与研发" | "办公与管理" | "数据与科研" | "开发与代码";

type Tool = {
  name: string;
  category: ToolCategory;
  description: string;
  icon: typeof FileText;
  accent: string;
  popular?: boolean;
};

const categories: Array<{ name: ToolCategory; appCount: number; skillCount: number; icon: typeof FileText }> = [
  { name: "内容与营销", appCount: 18, skillCount: 42, icon: FileText },
  { name: "视觉与媒体", appCount: 16, skillCount: 38, icon: ImageIcon },
  { name: "电商与销售", appCount: 14, skillCount: 35, icon: ShoppingCart },
  { name: "财务与法务", appCount: 12, skillCount: 28, icon: BriefcaseBusiness },
  { name: "产品与研发", appCount: 15, skillCount: 30, icon: Sparkles },
  { name: "办公与管理", appCount: 12, skillCount: 29, icon: Presentation },
  { name: "数据与科研", appCount: 10, skillCount: 24, icon: BarChart3 },
  { name: "开发与代码", appCount: 11, skillCount: 31, icon: Code2 },
];

const tools: Tool[] = [
  { name: "文案助手", category: "内容与营销", description: "生成营销文案、产品介绍、邮件与社媒内容", icon: FileText, accent: "violet", popular: true },
  { name: "SEO 内容生成", category: "内容与营销", description: "基于关键词生成 SEO 友好的文章、图网和标题", icon: Search, accent: "green", popular: true },
  { name: "社媒文案生成", category: "内容与营销", description: "为小红书、微博、公众号等生成爆款文案", icon: Megaphone, accent: "blue", popular: true },
  { name: "宣传海报设计", category: "视觉与媒体", description: "一键生成高质宣传图、活动宣传图", icon: ImageIcon, accent: "orange", popular: true },
  { name: "图片编辑", category: "视觉与媒体", description: "图片抠图、消除、换色、合成与风格转换", icon: Sparkles, accent: "violet" },
  { name: "短视频脚本生成", category: "视觉与媒体", description: "生成短视频脚本、分镜头与拍摄建议", icon: Video, accent: "purple" },
  { name: "视频剪辑助手", category: "视觉与媒体", description: "自动生成剪辑方案与字幕，支持多种格式", icon: Video, accent: "blue" },
  { name: "商品标题优化", category: "电商与销售", description: "输出高转化标题、卖点与商品详情页结构", icon: ShoppingCart, accent: "orange" },
  { name: "合同风险识别", category: "财务与法务", description: "识别合同条款风险并生成审阅建议", icon: BriefcaseBusiness, accent: "blue" },
  { name: "PRD 生成", category: "产品与研发", description: "从需求描述生成结构化产品需求文档", icon: Sparkles, accent: "violet" },
  { name: "PPT 排版优化", category: "办公与管理", description: "将大纲快速整理为可编辑的演示文稿", icon: Presentation, accent: "red" },
  { name: "数据清洗", category: "数据与科研", description: "处理表格、字段与异常数据，输出分析建议", icon: BarChart3, accent: "green" },
  { name: "代码审阅", category: "开发与代码", description: "发现潜在问题并给出可执行的修复建议", icon: Code2, accent: "slate" },
  { name: "竞品分析", category: "数据与科研", description: "整理竞品信息、功能差异与市场报告", icon: Search, accent: "blue" },
  { name: "用户画像生成", category: "电商与销售", description: "根据数据生成用户画像、洞察与行动建议", icon: BriefcaseBusiness, accent: "purple" },
];

export default function ApplicationDirectory({ initialQuery = "", initialCategory }: { initialQuery?: string; initialCategory?: string }) {
  const router = useRouter();
  const categoryParam = initialCategory as ToolCategory | undefined;
  const resolvedCategory = categoryParam && categories.some((category) => category.name === categoryParam) ? categoryParam : "全部应用";
  const [activeCategory, setActiveCategory] = useState<ToolCategory | "全部应用">(resolvedCategory);
  const [query, setQuery] = useState(initialQuery);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    const filtered = tools.filter((tool) =>
      (activeCategory === "全部应用" || tool.category === activeCategory) &&
      (!value || `${tool.name}${tool.category}${tool.description}`.toLowerCase().includes(value)),
    );
    return filtered;
  }, [activeCategory, query]);

  const selectCategory = (category: ToolCategory | "全部应用") => {
    setActiveCategory(category);
    const params = new URLSearchParams(window.location.search);
    params.set("cate", "app");
    if (category === "全部应用") params.delete("category");
    else params.set("category", category);
    router.replace(`/products?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="portal-directory-layout" aria-label="应用工具目录">
      <aside className="portal-directory-side">
        <h2>工具分类</h2>
        <button
          className={`portal-directory-all${activeCategory === "全部应用" ? " is-active" : ""}`}
          type="button"
          onClick={() => selectCategory("全部应用")}
        >
          全部应用
          <ChevronRight aria-hidden />
        </button>
        {categories.map((category) => {
          const Icon = category.icon;
          const active = activeCategory === category.name;
          return (
            <button
              key={category.name}
              type="button"
              className="portal-directory-model-row"
              data-active={active || undefined}
              onClick={() => selectCategory(category.name)}
            >
              <Icon aria-hidden />
              <span>
                <strong>{category.name}</strong>
                <small>应用 {category.appCount} · Skills {category.skillCount}</small>
              </span>
              <ChevronRight aria-hidden />
            </button>
          );
        })}
        <div className="app-directory-help">
          <strong>不会选工具？</strong>
          <p>智能推荐工具，帮你快速找到合适的能力。</p>
          <Link href="/studio/skills">智能推荐工具 →</Link>
        </div>
      </aside>

      <div className="portal-directory-main">
        <section className="portal-catalog-hero">
          <div className="portal-catalog-title-row">
            <div>
              <h1>{activeCategory === "全部应用" ? "应用工具" : activeCategory}</h1>
              <p className="portal-catalog-lead">按场景与角色快速找到可直接使用的 AI 工具。</p>
            </div>
            <div className="portal-catalog-hero-links">
              <Link href="/studio/skills">Skills 技能</Link>
              <Link href="/studio">进入工作台</Link>
            </div>
          </div>
          <form className="portal-catalog-search" onSubmit={(event) => event.preventDefault()}>
            <Search aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索应用"
              placeholder="搜索工具名称、关键词或使用场景"
            />
            {query ? (
              <button type="button" className="portal-catalog-clear" onClick={() => setQuery("")} aria-label="清除搜索">
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <button type="submit">
              <Search aria-hidden />
              搜索
            </button>
          </form>
        </section>

        <section className="app-directory-section">
          <div className="app-tool-grid">{visible.map((tool) => <ToolCard key={tool.name} tool={tool} />)}</div>
          {visible.length === 0 ? <div className="app-directory-empty">没有匹配的应用工具，试试搜索其他任务或切换分类。</div> : null}
        </section>

        <SkillStrip />
      </div>
    </section>
  );
}

const featuredSkills = [
  "SEO 内容优化", "财务报表分析", "合同风险识别", "小红书文案", "PPT 排版优化", "数据清洗",
  "PRD 生成", "邮件跟进", "会议纪要", "竞品研究", "商品标题优化", "代码审阅",
];

function SkillStrip() {
  return (
    <section className="app-skill-strip" aria-labelledby="app-skill-strip-title">
      <div className="app-skill-strip-head">
        <h2 id="app-skill-strip-title">Skills 技能</h2>
        <div className="app-skill-strip-actions">
          <Link href="/studio/skills">查看全部<ChevronRight aria-hidden /></Link>
        </div>
      </div>
      <div className="app-skill-grid" aria-label="Skills 技能列表">
        {featuredSkills.map((skill, index) => (
          <Link key={skill} className={index === 0 ? "is-featured" : undefined} href={`/studio/skills?q=${encodeURIComponent(skill)}`}>
            <span className="app-skill-index">{String(index + 1).padStart(2, "0")}</span>
            <strong>{skill}</strong>
            <small>{index === 0 ? "精选技能" : "技能"}</small>
            <ChevronRight aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <article className={`app-tool-card is-${tool.accent}`}>
      <Icon aria-hidden />
      <div>
        <h3>{tool.name}</h3>
        <p>{tool.description}</p>
      </div>
      <Link href={`/studio?entry=tool-directory&tool=${encodeURIComponent(tool.name)}`}>立即使用</Link>
    </article>
  );
}
