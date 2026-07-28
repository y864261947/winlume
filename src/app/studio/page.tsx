"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clapperboard,
  FileText,
  Globe2,
  LoaderCircle,
  Megaphone,
  Search,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Composer from "@/components/studio/Composer";
import { useModals } from "@/components/providers";
import type { SkillMeta } from "@/lib/agent/types";
import {
  createSession,
  setPendingFirstMessage,
  StudioApiError,
} from "@/lib/studio/api";
import { clearComposerDraft } from "@/lib/studio/composer-draft";
import {
  FALLBACK_DEFAULT_MODEL,
  getDefaultModel,
} from "@/lib/studio/prefs";

/** Demo-aligned capability cards (fallback when featured API empty). */
const FALLBACK_CAPABILITY_CARDS: {
  key: string;
  label: string;
  desc: string;
  prompt: string;
  skillIds: string[];
  icon: LucideIcon;
}[] = [
  {
    key: "promo",
    label: "做宣传内容",
    desc: "文案、海报、图文全套宣传",
    icon: Megaphone,
    prompt:
      "帮我为上海新开的咖啡店做一套开业宣传，包括文案和海报主视觉方向，语气温暖有品质感。",
    skillIds: ["marketing-content-creator", "design-brand-guardian"],
  },
  {
    key: "research",
    label: "做调研报告",
    desc: "行业分析、竞品调研、趋势洞察",
    icon: Search,
    prompt:
      "帮我做一份新式茶饮行业的竞品调研报告提纲，包含趋势与定价对比维度。",
    skillIds: ["product-trend-researcher", "finance-financial-analyst"],
  },
  {
    key: "video",
    label: "制作短视频",
    desc: "脚本、配音、剪辑思路一站规划",
    icon: Clapperboard,
    prompt:
      "帮我给新品奶茶做一条 15 秒抖音广告脚本，风格活泼有节奏感，含分镜与字幕建议。",
    skillIds: ["marketing-douyin-strategist", "marketing-social-media-strategist"],
  },
  {
    key: "files",
    label: "处理文件",
    desc: "总结、提取、翻译、格式转换",
    icon: FileText,
    prompt:
      "帮我总结以下内容的核心观点、关键结论与可执行建议（按条目输出）。\n\n【在此粘贴文本】",
    skillIds: ["engineering-technical-writer"],
  },
  {
    key: "ecommerce",
    label: "做电商素材",
    desc: "商品图、详情页、主图文案",
    icon: ShoppingBag,
    prompt:
      "帮我为新款保温杯设计一套详情页文案结构：卖点分层、场景故事与规格表说明。",
    skillIds: ["marketing-content-creator", "design-image-prompt-engineer"],
  },
  {
    key: "web",
    label: "生成一个网页",
    desc: "活动页、介绍页、单页网站结构",
    icon: Globe2,
    prompt:
      "帮我规划一个瑜伽工作室开业活动落地页：信息架构、文案大纲与视觉风格建议。",
    skillIds: ["design-ui-designer", "marketing-content-creator"],
  },
];

const FEATURED_ICONS: LucideIcon[] = [
  Sparkles,
  Megaphone,
  Search,
  Clapperboard,
  FileText,
  ShoppingBag,
  Globe2,
];

type SceneCard = {
  key: string;
  label: string;
  desc: string;
  prompt: string;
  skillIds: string[];
  icon: LucideIcon;
};

function skillToCard(skill: SkillMeta, index: number): SceneCard {
  return {
    key: skill.id,
    label: skill.name,
    desc: skill.description || "精选技能，一键挂载并预填示例。",
    prompt:
      skill.examplePrompt?.trim() ||
      `请以「${skill.name}」的专业视角帮我完成任务。`,
    skillIds: [skill.id],
    icon: FEATURED_ICONS[index % FEATURED_ICONS.length] ?? Sparkles,
  };
}

function StudioHomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openLogin, account } = useModals();
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(FALLBACK_DEFAULT_MODEL);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [featuredSkills, setFeaturedSkills] = useState<SkillMeta[] | null>(null);

  useEffect(() => {
    const prompt = searchParams.get("prompt");
    const skill = searchParams.get("skill");
    const modelParam = searchParams.get("model")?.trim();
    if (prompt) setDraft(prompt);
    if (skill) setSelectedSkillIds([skill]);
    if (modelParam) {
      setModel(modelParam);
    } else {
      setModel(getDefaultModel());
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills?featured=1", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("featured");
        return res.json() as Promise<{ skills?: SkillMeta[] }>;
      })
      .then((data) => {
        if (!cancelled) setFeaturedSkills(data.skills ?? []);
      })
      .catch(() => {
        if (!cancelled) setFeaturedSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sceneCards = useMemo((): SceneCard[] => {
    const featured = featuredSkills ?? [];
    if (featured.length > 0) {
      return featured.slice(0, 12).map(skillToCard);
    }
    // While loading (null) or empty: use hard-coded fallback
    return FALLBACK_CAPABILITY_CARDS;
  }, [featuredSkills]);

  const applyCard = useCallback((card: SceneCard) => {
    setDraft(card.prompt);
    setSelectedSkillIds([...card.skillIds]);
  }, []);

  const startChat = useCallback(
    async (text: string, meta?: { skillIds?: string[] }) => {
      const message = text.trim();
      if (!message || starting) return;

      if (!account) {
        setError("请先登录后再开始对话");
        openLogin("login");
        return;
      }

      const skillIds =
        meta?.skillIds?.length
          ? meta.skillIds
          : selectedSkillIds.length
            ? selectedSkillIds
            : undefined;

      setStarting(true);
      setError(null);
      try {
        const title =
          message.replace(/\s+/g, " ").length > 40
            ? `${message.replace(/\s+/g, " ").slice(0, 40)}…`
            : message.replace(/\s+/g, " ");
        const requestModel = model.trim() || getDefaultModel();
        const session = await createSession({
          model: requestModel,
          title: title || "新对话",
        });
        setPendingFirstMessage({
          sessionId: session.id,
          message,
          model: requestModel,
          skillIds,
        });
        setSelectedSkillIds([]);
        setDraft("");
        clearComposerDraft("home");
        router.push(`/studio/c/${session.id}`);
      } catch (err) {
        if (err instanceof StudioApiError && err.status === 401) {
          setError("请先登录后再开始对话");
          openLogin("login");
        } else {
          setError(err instanceof Error ? err.message : "创建会话失败");
        }
        setStarting(false);
      }
    },
    [account, model, openLogin, router, selectedSkillIds, starting],
  );

  const greetingName =
    account?.display_name || account?.username
      ? `，${account.display_name || account.username}`
      : "";

  const sectionHint =
    featuredSkills && featuredSkills.length > 0
      ? "选择精选技能后即可开始；也可直接在下方描述你的目标。选中会预填示例并挂上该 Skill。"
      : "选择方向后即可开始；也可直接在下方描述你的目标。选中方向会预填提示并挂上推荐 Skills。";

  return (
    <div className="studio-view-in flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10 lg:px-11">
        <div className="mx-auto max-w-[1180px]">
          <header className="studio-fade-up mb-7 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold tracking-tight text-[#241E36] sm:whitespace-nowrap">
                你好{greetingName}，今天想完成什么？
              </h1>
              <p className="mt-1.5 text-[14px] text-[#8A8298]">
                不用挑模型，告诉我结果就行——平台会按需组合能力与 Skills。
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-3 sm:flex">
              <span
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-white/80 bg-white/70 text-[#615A73] shadow-sm backdrop-blur"
                title="通知（即将上线）"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
              </span>
            </div>
          </header>

          <section className="studio-glass studio-fade-up relative mb-8 overflow-hidden rounded-[22px] px-7 py-7">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
              aria-hidden
            />
            <h2 className="text-[21px] font-bold tracking-tight text-[#241E36]">
              一句话调用多个 AI 能力
            </h2>
            <p className="mt-1.5 text-[13.5px] text-[#8A8298]">{sectionHint}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sceneCards.map((card, i) => {
                const Icon = card.icon;
                const active =
                  card.skillIds.every((id) => selectedSkillIds.includes(id)) &&
                  draft.startsWith(card.prompt.slice(0, 12));
                return (
                  <button
                    key={card.key}
                    type="button"
                    disabled={starting}
                    onClick={() => applyCard(card)}
                    style={{ animationDelay: `${0.04 * i}s` }}
                    className={`studio-fade-up group rounded-[16px] border p-4 text-left transition duration-150 hover:-translate-y-0.5 disabled:opacity-50 ${
                      active
                        ? "border-[rgba(194,65,12,0.35)] bg-[rgba(194,65,12,0.08)] shadow-md"
                        : "border-white/70 bg-white/50 hover:border-[rgba(194,65,12,0.2)] hover:bg-white/80"
                    }`}
                  >
                    <span
                      className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[12px] ${
                        active
                          ? "bg-gradient-to-br from-[#F2994A] to-[#C2410C] text-white"
                          : "bg-[rgba(194,65,12,0.1)] text-[#C2410C]"
                      }`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <p className="text-[15px] font-semibold text-[#241E36]">{card.label}</p>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-[#8A8298]">
                      {card.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedSkillIds.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[#8A8298]">已挂 Skills：</span>
              {selectedSkillIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-[rgba(194,65,12,0.2)] bg-[rgba(194,65,12,0.08)] px-2.5 py-1 text-[11px] font-medium text-[#C2410C]"
                >
                  <Sparkles className="h-3 w-3" />
                  {id}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={startChat}
        disabled={starting}
        model={model}
        onModelChange={setModel}
        skillIds={selectedSkillIds}
        onSkillIdsChange={setSelectedSkillIds}
        error={error}
        onClearError={() => setError(null)}
        draftKey="home"
        placeholder={
          starting
            ? "正在创建会话…"
            : "一句话描述你想完成的事，或点上方能力卡片…"
        }
      />
    </div>
  );
}

function StudioHomeFallback() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-sm text-[#8A8298]"
      role="status"
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-[#C2410C]" />
      正在打开工作台…
    </div>
  );
}

/**
 * useSearchParams must sit under Suspense; otherwise Next bails the whole
 * segment to CSR and users only see the root "页面加载中" shell.
 */
export default function StudioHomePage() {
  return (
    <Suspense fallback={<StudioHomeFallback />}>
      <StudioHomeInner />
    </Suspense>
  );
}
