"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BarChart3, BriefcaseBusiness, ChevronRight, Code2, FileText, ImageIcon,
  Megaphone, Presentation, Search, ShoppingCart, Sparkles, Video, X,
} from "lucide-react";
import Modal, { ModalCloseButton } from "./Modal";
import { catalogAccentStyle } from "@/lib/studio/skill-mark";

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
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [recommendationCategory, setRecommendationCategory] = useState<ToolCategory | null>(null);

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

  const openRecommendation = () => {
    setRecommendationCategory(null);
    setRecommendationOpen(true);
  };

  const recommendationTools = recommendationCategory
    ? tools.filter((tool) => tool.category === recommendationCategory)
    : [];

  return (
    <>
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
          <button type="button" onClick={openRecommendation}>智能推荐工具 <ChevronRight aria-hidden /></button>
        </div>
      </aside>

      <div className="portal-directory-main">
        <section className="portal-catalog-hero">
          <div className="portal-catalog-title-row">
            <div>
              <h1>{activeCategory === "全部应用" ? "应用工具" : activeCategory}</h1>
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

        <SkillStrip category={activeCategory} />
      </div>
      </section>

      <Modal
        open={recommendationOpen}
        onClose={() => setRecommendationOpen(false)}
        label="智能推荐工具"
        size="onboarding"
      >
        <div className="app-recommendation-dialog">
          <header className="app-recommendation-head">
            <div>
              <span><Sparkles aria-hidden /> 智能推荐</span>
              <h2>帮你找到合适的工具</h2>
              <p>{recommendationCategory ? "根据你的场景，为你推荐可直接使用的工具。" : "先选择你要完成的事情，我们会为你缩小选择范围。"}</p>
            </div>
            <ModalCloseButton onClose={() => setRecommendationOpen(false)} />
          </header>

          {recommendationCategory ? (
            <div className="app-recommendation-results">
              <button
                type="button"
                className="app-recommendation-back"
                onClick={() => setRecommendationCategory(null)}
              >
                <ArrowLeft aria-hidden /> 重新选择场景
              </button>
              <div className="app-recommendation-context">
                <span className="app-recommendation-context-icon"><CategoryIcon category={recommendationCategory} /></span>
                <div>
                  <strong>{recommendationCategory}</strong>
                  <small>{recommendationTools.length} 个推荐工具</small>
                </div>
              </div>
              <div className="app-recommendation-tool-grid">
                {recommendationTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <article key={tool.name} className={`app-recommendation-tool is-${tool.accent}`}>
                      <span className="app-recommendation-tool-icon"><Icon aria-hidden /></span>
                      <div>
                        <h3>{tool.name}</h3>
                        <p>{tool.description}</p>
                      </div>
                      <Link
                        href={`/studio?entry=application-catalog&tool=${encodeURIComponent(tool.name)}`}
                        onClick={() => setRecommendationOpen(false)}
                      >
                        立即使用 <ChevronRight aria-hidden />
                      </Link>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="app-recommendation-categories">
              <div className="app-recommendation-category-grid">
                {categories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.name}
                      type="button"
                      className="app-recommendation-category"
                      onClick={() => setRecommendationCategory(category.name)}
                    >
                      <span className="app-recommendation-category-icon"><Icon aria-hidden /></span>
                      <span className="app-recommendation-category-copy">
                        <strong>{category.name}</strong>
                        <small>{category.appCount} 个应用 · {category.skillCount} 项技能</small>
                      </span>
                      <ChevronRight aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

const featuredSkills: Array<{ name: string; category: ToolCategory }> = [
  { name: "SEO 内容优化", category: "内容与营销" },
  { name: "财务报表分析", category: "财务与法务" },
  { name: "合同风险识别", category: "财务与法务" },
  { name: "小红书文案", category: "内容与营销" },
  { name: "PPT 排版优化", category: "办公与管理" },
  { name: "数据清洗", category: "数据与科研" },
  { name: "PRD 生成", category: "产品与研发" },
  { name: "邮件跟进", category: "办公与管理" },
  { name: "会议纪要", category: "办公与管理" },
  { name: "竞品研究", category: "数据与科研" },
  { name: "商品标题优化", category: "电商与销售" },
  { name: "代码审阅", category: "开发与代码" },
];

const skillsByCategory: Record<ToolCategory, Array<{ name: string; category: ToolCategory }>> = {
  "内容与营销": [
    { name: "SEO 内容优化", category: "内容与营销" }, { name: "小红书文案", category: "内容与营销" },
    { name: "品牌内容改写", category: "内容与营销" }, { name: "邮件营销文案", category: "内容与营销" },
  ],
  "视觉与媒体": [
    { name: "海报视觉提案", category: "视觉与媒体" }, { name: "图片抠图与修复", category: "视觉与媒体" },
    { name: "短视频分镜", category: "视觉与媒体" }, { name: "视频字幕优化", category: "视觉与媒体" },
  ],
  "电商与销售": [
    { name: "商品标题优化", category: "电商与销售" }, { name: "商品详情页", category: "电商与销售" },
    { name: "用户画像生成", category: "电商与销售" }, { name: "销售话术设计", category: "电商与销售" },
  ],
  "财务与法务": [
    { name: "财务报表分析", category: "财务与法务" }, { name: "合同风险识别", category: "财务与法务" },
    { name: "发票信息整理", category: "财务与法务" }, { name: "合规检查清单", category: "财务与法务" },
  ],
  "产品与研发": [
    { name: "PRD 生成", category: "产品与研发" }, { name: "需求拆解", category: "产品与研发" },
    { name: "用户故事编写", category: "产品与研发" }, { name: "竞品功能分析", category: "产品与研发" },
  ],
  "办公与管理": [
    { name: "PPT 排版优化", category: "办公与管理" }, { name: "邮件跟进", category: "办公与管理" },
    { name: "会议纪要", category: "办公与管理" }, { name: "文档摘要整理", category: "办公与管理" },
  ],
  "数据与科研": [
    { name: "数据清洗", category: "数据与科研" }, { name: "研究报告生成", category: "数据与科研" },
    { name: "数据可视化解读", category: "数据与科研" }, { name: "竞品研究", category: "数据与科研" },
  ],
  "开发与代码": [
    { name: "代码审阅", category: "开发与代码" }, { name: "API 文档生成", category: "开发与代码" },
    { name: "单元测试编写", category: "开发与代码" }, { name: "SQL 优化", category: "开发与代码" },
  ],
};

const skillDescriptions: Record<string, string> = {
  "SEO 内容优化": "围绕关键词生成结构清晰、适合搜索引擎的内容方案。",
  "小红书文案": "生成适合小红书发布的标题、正文和互动话术。",
  "品牌内容改写": "统一品牌语气，快速改写并优化现有内容。",
  "邮件营销文案": "编写营销邮件、跟进邮件与转化导向的主题内容。",
  "海报视觉提案": "整理视觉方向、版式建议与可执行的海报创意。",
  "图片抠图与修复": "处理抠图、瑕疵修复与基础图片优化任务。",
  "短视频分镜": "把创意拆解为镜头、节奏和拍摄执行清单。",
  "视频字幕优化": "校对字幕并优化断句、时间轴和多语言表达。",
};

const skillAccentByCategory: Record<ToolCategory, string> = {
  "内容与营销": "#7c5ce4",
  "视觉与媒体": "#2f8fd7",
  "电商与销售": "#d98b25",
  "财务与法务": "#278d74",
  "产品与研发": "#596fd6",
  "办公与管理": "#d05b72",
  "数据与科研": "#438cbd",
  "开发与代码": "#64748b",
};

function SkillStrip({ category }: { category: ToolCategory | "全部应用" }) {
  const skills = category === "全部应用" ? featuredSkills : skillsByCategory[category];

  return (
    <section className="app-skill-strip" aria-labelledby="app-skill-strip-title">
      <div className="app-skill-strip-head">
        <h2 id="app-skill-strip-title">Skills 技能</h2>
        <div className="app-skill-strip-actions">
          <Link href="/studio/skills">查看全部<ChevronRight aria-hidden /></Link>
        </div>
      </div>
      <div className="studio-catalog-grid app-directory-skill-grid" aria-label="Skills 技能列表">
        {skills.map((skill) => {
          const SkillIcon = categories.find((item) => item.name === skill.category)?.icon ?? Sparkles;
          const description = skillDescriptions[skill.name] ?? "面向实际工作场景的可复用技能，点击即可挂到工作台。";
          return (
            <Link
            key={skill.name}
            className="studio-catalog-card"
            style={catalogAccentStyle(skillAccentByCategory[skill.category])}
            href={`/studio?entry=application-catalog&skillName=${encodeURIComponent(skill.name)}`}
          >
            <div className="flex items-start gap-3">
              <span className="studio-catalog-mark"><SkillIcon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 tracking-tight text-ink-900">{skill.name}</h3>
                <span className="mt-1 inline-block text-[11px] leading-4 text-ink-400">{skill.category}</span>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-ink-500">{description}</p>
            <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-medium text-ink-700">
              挂到工作台
              <ArrowRight className="studio-catalog-card-go h-3.5 w-3.5" />
            </span>
            </Link>
          );
        })}
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
      <Link href={`/studio?entry=application-catalog&tool=${encodeURIComponent(tool.name)}`}>立即使用</Link>
    </article>
  );
}

function CategoryIcon({ category }: { category: ToolCategory }) {
  const Icon = categories.find((item) => item.name === category)?.icon ?? Sparkles;
  return <Icon aria-hidden />;
}
