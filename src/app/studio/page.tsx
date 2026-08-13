"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Clapperboard,
  FileText,
  FolderKanban,
  Globe2,
  LoaderCircle,
  Megaphone,
  Search,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Composer, {
  type ComposerSendMeta,
} from "@/components/studio/Composer";
import { useModals } from "@/components/providers";
import type { Project, SkillMeta } from "@/lib/agent/types";
import {
  createSession,
  getProject,
  setPendingFirstMessage,
  StudioApiError,
  uploadImageArtifact,
  uploadVideoArtifact,
  startVideoAnalysis,
} from "@/lib/studio/api";
import { clearComposerDraft } from "@/lib/studio/composer-draft";
import {
  extractAtMentionNames,
  resolveReferencedArtifactIds,
} from "@/lib/studio/image-mentions";
import type { ImageAttachment } from "@/lib/studio/composer-attachments";
import { resolveCapabilityPreset } from "@/lib/studio/capability-presets";
import type { CapabilityCatalog } from "@/lib/studio/capabilities";
import {
  FALLBACK_DEFAULT_MODEL,
  getDefaultModel,
} from "@/lib/studio/prefs";

const DOCK_MS = 340;
const DOCK_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const STUDIO_ENTRY_CONTEXT: Record<string, { label: string; detail: string }> = {
  "model-catalog": {
    label: "来自模型目录",
    detail: "模型已带入工作台；开始前仍可按需要确认或切换模型。",
  },
  "application-catalog": {
    label: "来自应用工具目录",
    detail: "描述你的任务即可开始，也可以在对话中随时更换模型。",
  },
  "model-catalog-empty": {
    label: "来自模型目录",
    detail: "当前没有匹配的模型；你仍可以直接描述任务并开始使用。",
  },
  "application-catalog-empty": {
    label: "来自应用工具目录",
    detail: "当前没有匹配的应用；你仍可以直接描述任务并开始使用。",
  },
};

/**
 * FLIP the home composer from hero center down to a bottom-docked slot
 * before View Transition navigation (no second DOM tree / no cover).
 */
function flipComposerToDock(
  setDocking: (v: boolean) => void,
): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setDocking(true);
    return Promise.resolve();
  }

  const form = document.querySelector<HTMLElement>(
    "#studio-home-composer .studio-liquid-glass",
  );
  if (!form) {
    setDocking(true);
    return Promise.resolve();
  }

  const first = form.getBoundingClientRect();
  setDocking(true);

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const last = form.getBoundingClientRect();
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        const sx = last.width ? first.width / last.width : 1;
        const sy = last.height ? first.height / last.height : 1;

        form.style.transformOrigin = "top left";
        form.style.transition = "none";
        form.style.willChange = "transform";
        form.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        // force invert frame
        void form.getBoundingClientRect();

        requestAnimationFrame(() => {
          form.style.transition = `transform ${DOCK_MS}ms ${DOCK_EASE}`;
          form.style.transform = "translate(0, 0) scale(1)";

          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            form.style.transition = "";
            form.style.transform = "";
            form.style.willChange = "";
            form.style.transformOrigin = "";
            form.removeEventListener("transitionend", onEnd);
            resolve();
          };
          const onEnd = (e: TransitionEvent) => {
            if (e.target === form && e.propertyName === "transform") finish();
          };
          form.addEventListener("transitionend", onEnd);
          window.setTimeout(finish, DOCK_MS + 80);
        });
      });
    });
  });
}

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

function CapabilityCard({
  card,
  active,
  disabled,
  onClick,
  className = "",
}: {
  card: SceneCard;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className={`studio-cap-card group rounded-[18px] p-4 text-left disabled:opacity-50 ${className}`}
    >
      <span
        className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[12px] ${
          active
            ? "bg-gradient-to-br from-[#334155] to-[#0F172A] text-white"
            : "bg-[rgba(15, 23, 42,0.1)] text-[#0F172A]"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="text-[15px] font-semibold tracking-tight text-[#241E36]">
        {card.label}
      </p>
      <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-[#8A8298]">
        {card.desc}
      </p>
    </button>
  );
}

function StudioHomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openLogin, account } = useModals();
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(FALLBACK_DEFAULT_MODEL);
  const [starting, setStarting] = useState(false);
  /** FLIP composer to bottom dock before route change (visual only). */
  const [docking, setDocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [capabilityPresetId, setCapabilityPresetId] = useState<string | null>(null);
  const [featuredSkills, setFeaturedSkills] = useState<SkillMeta[] | null>(null);
  const [allSkills, setAllSkills] = useState<SkillMeta[]>([]);
  const projectId = searchParams.get("projectId")?.trim() || "";
  const entryContext = STUDIO_ENTRY_CONTEXT[searchParams.get("entry") ?? ""];
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const prompt = searchParams.get("prompt");
      const skill = searchParams.get("skill");
      const modelParam = searchParams.get("model")?.trim();
      const presetParam = searchParams.get("preset");
      if (prompt) setDraft(prompt);
      if (skill) setSelectedSkillIds([skill]);
      setModel(getDefaultModel());
      setCapabilityPresetId(null);

      if (!modelParam && !presetParam) return;
      void fetch("/api/capabilities", { credentials: "same-origin" })
        .then(async (response) => {
          if (!response.ok) throw new Error("capabilities");
          return response.json() as Promise<CapabilityCatalog>;
        })
        .then((catalog) => {
          if (cancelled) return;
          const preset = resolveCapabilityPreset(presetParam, catalog);
          const requestedModel =
            modelParam && catalog.models.includes(modelParam)
              ? modelParam
              : undefined;
          const resolvedModel = requestedModel ?? preset?.model;
          if (resolvedModel) setModel(resolvedModel);
          if (preset) {
            setCapabilityPresetId(preset.id);
            if (!skill) setSelectedSkillIds([]);
          }
        })
        .catch(() => {
          if (!cancelled) setCapabilityPresetId(null);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchParams]);

  useEffect(() => {
    if (!account || !projectId) {
      const timer = window.setTimeout(() => setProject(null), 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    getProject(projectId)
      .then((nextProject) => {
        if (!cancelled) setProject(nextProject);
      })
      .catch(() => {
        if (!cancelled) setProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, projectId]);

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

  // Full catalog for scroll discovery under the fold
  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("skills");
        return res.json() as Promise<{ skills?: SkillMeta[] }>;
      })
      .then((data) => {
        if (!cancelled) setAllSkills(data.skills ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sceneCards = useMemo((): SceneCard[] => {
    const featured = featuredSkills ?? [];
    const byId = new Map<string, SceneCard>();
    featured.forEach((s, i) => byId.set(s.id, skillToCard(s, i)));
    allSkills.forEach((s, i) => {
      if (!byId.has(s.id)) byId.set(s.id, skillToCard(s, featured.length + i));
    });
    const list = [...byId.values()];
    if (list.length > 0) return list.slice(0, 36);
    return FALLBACK_CAPABILITY_CARDS;
  }, [featuredSkills, allSkills]);

  const applyCard = useCallback((card: SceneCard) => {
    setDraft(card.prompt);
    setSelectedSkillIds([...card.skillIds]);
    // Bring focus back to the hero composer
    requestAnimationFrame(() => {
      document
        .getElementById("studio-home-composer")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Focus textarea without blue system outline (we style focus ourselves)
      const ta = document.querySelector<HTMLTextAreaElement>(
        "#studio-home-composer textarea",
      );
      ta?.focus({ preventScroll: true });
    });
  }, []);

  const startChat = useCallback(
    async (text: string, meta?: ComposerSendMeta) => {
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

      // 1) Slide composer to bottom (FLIP) while creating session
      // 2) Upload local images and reference video after the session exists
      // 3) View Transition navigate — shared studio-composer morph
      setStarting(true);
      setError(null);
      try {
        const title =
          message.replace(/\s+/g, " ").length > 40
            ? `${message.replace(/\s+/g, " ").slice(0, 40)}…`
            : message.replace(/\s+/g, " ");
        const requestModel = model.trim() || getDefaultModel();
        const sessionPromise = createSession({
          model: requestModel,
          title: title || "新对话",
          projectId: project?.id || projectId || undefined,
          capabilityPresetId: capabilityPresetId ?? undefined,
        });
        const dockPromise = flipComposerToDock(setDocking);
        const session = await sessionPromise;

        // Persist home-composer images under 图片N so @图片1 stays meaningful.
        const uploads = meta?.pendingImageUploads ?? [];
        const asAttachments: ImageAttachment[] = [];
        for (const item of uploads) {
          try {
            const artifact = await uploadImageArtifact({
              sessionId: session.id,
              name: item.name,
              dataUrl: item.dataUrl,
            });
            asAttachments.push({
              id: item.localId,
              name: item.name,
              mimeType: "image/png",
              size: 0,
              dataUrl: item.dataUrl,
              artifactId: artifact.id,
            });
          } catch {
            asAttachments.push({
              id: item.localId,
              name: item.name,
              mimeType: "image/png",
              size: 0,
              dataUrl: item.dataUrl,
            });
          }
        }

        // Files cannot cross the sessionStorage handoff. Persist the authorized
        // source and create its analysis job before navigating to the session.
        for (const item of meta?.pendingVideoUploads ?? []) {
          const source = await uploadVideoArtifact({
            sessionId: session.id,
            file: item.file,
            authorized: item.authorized,
          });
          await startVideoAnalysis({ sourceArtifactId: source.id, goal: "both" });
        }

        let referencedArtifactIds =
          meta?.referencedArtifactIds?.filter(Boolean) ?? [];
        if (!referencedArtifactIds.length && extractAtMentionNames(message).length) {
          referencedArtifactIds = resolveReferencedArtifactIds(
            message,
            asAttachments,
            [],
          );
        } else if (asAttachments.length) {
          // Prefer ids from successful uploads when meta only had local placeholders.
          const fromUploads = resolveReferencedArtifactIds(
            message,
            asAttachments,
            [],
          );
          if (fromUploads.length) referencedArtifactIds = fromUploads;
        }

        await dockPromise;
        setPendingFirstMessage({
          sessionId: session.id,
          message,
          model: requestModel,
          capabilityPresetId: session.capabilityPresetId,
          skillIds,
          referencedArtifactIds: referencedArtifactIds.length
            ? referencedArtifactIds
            : undefined,
          session,
        });
        setSelectedSkillIds([]);
        clearComposerDraft("home");
        // Keep draft until unmount so composer shared-element still has content.
        router.push(`/studio/c/${session.id}`, {
          transitionTypes: ["studio-handoff"],
        });
      } catch (err) {
        setDocking(false);
        if (err instanceof StudioApiError && err.status === 401) {
          setError("请先登录后再开始对话");
          openLogin("login");
        } else {
          setError(err instanceof Error ? err.message : "创建会话失败");
        }
        setStarting(false);
      }
    },
    [
      account,
      capabilityPresetId,
      model,
      openLogin,
      project,
      projectId,
      router,
      selectedSkillIds,
      starting,
    ],
  );

  const isCardActive = useCallback(
    (card: SceneCard) =>
      card.skillIds.every((id) => selectedSkillIds.includes(id)) &&
      draft.startsWith(card.prompt.slice(0, 12)),
    [draft, selectedSkillIds],
  );

  return (
    <div
      className="studio-home-canvas studio-view-in relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-docking={docking ? "true" : "false"}
    >
      {/* Top-right portal return and utility */}
      <div
        className={`pointer-events-none absolute right-5 top-4 z-[2] flex items-center gap-2 sm:right-8 sm:top-5 transition-opacity duration-200 ${
          docking ? "opacity-0" : "opacity-100"
        }`}
      >
        <Link
          href="/"
          className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-white/85 bg-white/72 px-3.5 text-[13px] font-medium text-[#615A73] shadow-[0_6px_16px_rgba(36,30,54,0.08)] backdrop-blur transition-[background-color,color,transform] duration-150 hover:bg-white/92 hover:text-[#241E36] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7398e8]/55"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          返回首页
        </Link>
        {!account ? (
          <>
            <button
              type="button"
              onClick={() => openLogin("login")}
              className="pointer-events-auto hidden h-9 items-center rounded-full border border-white/85 bg-white/72 px-3.5 text-[13px] font-medium text-[#615A73] shadow-[0_6px_16px_rgba(36,30,54,0.08)] backdrop-blur transition-[background-color,color,transform] duration-150 hover:bg-white/92 hover:text-[#241E36] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(115,152,232,0.55)] sm:inline-flex"
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => openLogin("register")}
              className="pointer-events-auto inline-flex h-9 items-center rounded-full bg-gradient-to-br from-[#334155] to-[#0F172A] px-3.5 text-[13px] font-medium text-white shadow-[0_7px_16px_rgba(15,23,42,0.22)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7398e8]/65"
            >
              注册
            </button>
          </>
        ) : null}
        <span
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/70 text-[#8A8298] shadow-sm backdrop-blur"
          title="通知（即将上线）"
        >
          <Bell className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </div>

      {/*
        Continuous page (no mid-scroll cliff).
        On send: FLIP composer to bottom dock, then View Transition into session.
      */}
      <section
        id="studio-home-composer"
        className={`studio-home-hero relative flex flex-col ${
          docking
            ? "min-h-0 flex-1"
            : "min-h-[72dvh] sm:min-h-[75dvh]"
        }`}
      >
        <div
          className={`studio-home-hero-inner flex min-h-0 flex-1 flex-col px-5 sm:px-10 ${
            docking
              ? "items-stretch justify-end pb-2 pt-0 sm:pb-3"
              : "items-center justify-center pb-10 pt-16 sm:pb-12 sm:pt-20"
          }`}
        >
          <div
            className={`w-full ${
              docking ? "mx-auto max-w-3xl" : "max-w-[720px]"
            }`}
          >
            {entryContext ? (
              <div className="mb-3 flex items-start gap-2 rounded-[12px] border border-white/75 bg-white/55 px-3 py-2 text-xs text-[#615A73] shadow-sm backdrop-blur">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#245FD0]" strokeWidth={1.8} />
                <div>
                  <p className="font-medium text-[#241E36]">{entryContext.label}</p>
                  <p className="mt-0.5 text-[#8A8298]">{entryContext.detail}</p>
                </div>
              </div>
            ) : null}
            {project ? (
              <div className="mb-3 flex items-center gap-2 rounded-[12px] border border-white/75 bg-white/55 px-3 py-2 text-xs text-[#615A73] shadow-sm backdrop-blur">
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" strokeWidth={1.8} />
                <span className="shrink-0 text-[#8A8298]">当前项目</span>
                <Link
                  href={`/studio/p/${encodeURIComponent(project.id)}`}
                  className="min-w-0 truncate font-medium text-[#241E36] hover:underline"
                >
                  {project.name}
                </Link>
                {project.description ? (
                  <span className="hidden min-w-0 truncate text-[#8A8298] sm:inline">
                    · {project.description}
                  </span>
                ) : null}
              </div>
            ) : null}
            <Composer
              variant={docking ? "default" : "hero"}
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
                  ? "正在进入对话…"
                  : "描述你想完成的事，或点下方能力卡片…"
              }
            />
          </div>
        </div>
      </section>

      <section
        id="studio-capabilities"
        className="studio-home-capabilities relative z-[1] px-5 pb-16 pt-2 sm:px-10 sm:pb-20 sm:pt-4"
        aria-hidden={docking}
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight text-[#241E36] sm:text-[20px]">
                能力与 Skills
              </h2>
              <p className="mt-1 text-[13px] text-[#8A8298]">
                点选后会预填示例并挂载技能，可在上方输入框继续修改。
              </p>
            </div>
            {selectedSkillIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#8A8298]">已挂载</span>
                {selectedSkillIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full border border-[rgba(15, 23, 42,0.2)] bg-[rgba(15, 23, 42,0.08)] px-2.5 py-1 text-[11px] font-medium text-[#0F172A]"
                  >
                    <Sparkles className="h-3 w-3" />
                    {id}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sceneCards.map((card, i) => (
              <CapabilityCard
                key={card.key}
                card={card}
                active={isCardActive(card)}
                disabled={starting}
                onClick={() => applyCard(card)}
                className={i < 3 ? "studio-cap-first-row" : undefined}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StudioHomeFallback() {
  return (
    <div
      className="studio-home-canvas flex flex-1 flex-col items-center justify-center gap-2 px-4 text-sm text-[#8A8298]"
      role="status"
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-[#0F172A]" />
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
