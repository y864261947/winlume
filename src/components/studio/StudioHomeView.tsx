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
import type { Project, Session, SkillMeta } from "@/lib/agent/types";
import {
  failPendingFirstMessage,
  getProject,
  notifyPendingFirstMessageStatus,
  resolvePendingFirstMessage,
  setPendingFirstMessage,
  StudioApiError,
  uploadImageArtifact,
  uploadSheetArtifact,
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
import {
  isGenericSkillPrompt,
  usableComposerPrompt,
} from "@/lib/studio/skill-prompt";
import {
  listStudioToolCategories,
  studioToolCategoryHref,
  type StudioCatalogCount,
} from "@/lib/studio/tool-categories";
import { listStudioToolsByCategory } from "@/lib/studio/tool-catalog";

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
    desc: skill.description || "精选技能，点选后挂载到本轮对话。",
    prompt: usableComposerPrompt(skill.examplePrompt) ?? "",
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
      className={`studio-cap-card group rounded-lg p-4 text-left disabled:opacity-50 ${className}`}
    >
      <span
        className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${
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

function StudioHomeInner({ active, tabId }: { active: boolean; tabId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openLogin, account } = useModals();
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(FALLBACK_DEFAULT_MODEL);
  const [starting, setStarting] = useState(false);
  /** FLIP composer to bottom dock before route change (visual only). */
  const [docking, setDocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Blanket safety net: no matter which awaited step in `startChat` stalls
   * without rejecting, the composer must self-heal instead of staying
   * disabled forever with no feedback. There's no `createSession` network
   * call to hang on any more (the session is minted client-side and only
   * created server-side inside the same request that starts the turn), so
   * this now only catches the dock animation's own fallback timer path or
   * an edge case neither covers. Cleared on unmount (i.e. once navigation
   * to the session page actually happens), so it never fires against a
   * page the user has left.
   */
  useEffect(() => {
    if (!starting) return;
    const id = window.setTimeout(() => {
      setStarting(false);
      setDocking(false);
      setError((prev) => prev ?? "进入对话超时，请重试");
    }, 20_000);
    return () => window.clearTimeout(id);
  }, [starting]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [capabilityPresetId, setCapabilityPresetId] = useState<string | null>(null);
  const [featuredSkills, setFeaturedSkills] = useState<SkillMeta[] | null>(null);
  const [catalogCounts, setCatalogCounts] = useState<StudioCatalogCount[]>([]);
  /**
   * Captured once at mount (lazy initializer), not derived reactively from
   * `searchParams`. Workspace tabs keep this view mounted across unrelated
   * navigations elsewhere in the app (see WorkspaceTabsHost); reading
   * `searchParams` live would re-apply a stale/foreign query string to a
   * background tab every time the URL changes anywhere else.
   */
  const [projectId] = useState(() => searchParams.get("projectId")?.trim() || "");
  const [seedArtifactId] = useState(() => searchParams.get("artifact")?.trim() || "");
  const [entryContext] = useState(() => STUDIO_ENTRY_CONTEXT[searchParams.get("entry") ?? ""]);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const prompt = searchParams.get("prompt");
      const skill = searchParams.get("skill");
      const modelParam = searchParams.get("model")?.trim();
      const presetParam = searchParams.get("preset");
      if (prompt) {
        const usable = usableComposerPrompt(prompt);
        if (usable) setDraft(usable);
        else setDraft("");
      }
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
    // Mount-once: see the lazy-init comment above `projectId` — this tab's
    // entry query string should only ever be applied once, not whenever the
    // URL changes elsewhere while this tab sits in the background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        return res.json() as Promise<{
          skills?: SkillMeta[];
          catalogs?: StudioCatalogCount[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        const featured = data.skills ?? [];
        setFeaturedSkills(featured);
        if (data.catalogs?.length) setCatalogCounts(data.catalogs);
      })
      .catch(() => {
        if (!cancelled) setFeaturedSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const workbenchCategories = useMemo(
    () =>
      listStudioToolCategories().map((category) => ({
        ...category,
        toolCount: listStudioToolsByCategory(category.id).length,
        skillCount:
          catalogCounts.find((item) => item.id === category.id)?.count ?? 0,
      })),
    [catalogCounts],
  );

  const sceneCards = useMemo((): SceneCard[] => {
    const featured = featuredSkills ?? [];
    if (featured.length > 0) {
      return featured.slice(0, 12).map((skill, index) => skillToCard(skill, index));
    }
    return FALLBACK_CAPABILITY_CARDS;
  }, [featuredSkills]);

  const applyCard = useCallback((card: SceneCard) => {
    const prompt = usableComposerPrompt(card.prompt);
    if (prompt) setDraft(prompt);
    else if (isGenericSkillPrompt(draft)) setDraft("");
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
  }, [draft]);

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
      const selectedCapabilityPresetId =
        meta?.capabilityPresetId ?? capabilityPresetId;

      // A client-minted id, committed to immediately: no network round trip
      // stands between clicking send and the message appearing. The server
      // only learns this session exists on the `prepared.commit(...)` call
      // below (`bootstrap`), which creates it with this exact id.
      const sessionId = crypto.randomUUID();
      const title =
        message.replace(/\s+/g, " ").length > 40
          ? `${message.replace(/\s+/g, " ").slice(0, 40)}…`
          : message.replace(/\s+/g, " ");
      const requestModel = model.trim() || getDefaultModel();
      const requestProjectId = project?.id || projectId || undefined;
      const syntheticSession: Session = {
        id: sessionId,
        userId: account.id,
        title: title || "新对话",
        model: requestModel,
        ...(requestProjectId ? { projectId: requestProjectId } : {}),
        ...(selectedCapabilityPresetId
          ? { capabilityPresetId: selectedCapabilityPresetId }
          : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setStarting(true);
      setError(null);
      let handedOff = false;
      try {
        await flipComposerToDock(setDocking);
        setPendingFirstMessage({
          sessionId,
          message,
          model: requestModel,
          capabilityPresetId: selectedCapabilityPresetId ?? undefined,
          composerOptions: meta?.composerOptions,
          skillIds,
          session: syntheticSession,
        });
        setSelectedSkillIds([]);
        clearComposerDraft("home");
        // Keep draft until unmount so composer shared-element still has content.
        handedOff = true;
        router.push(`/studio/c/${sessionId}`, {
          transitionTypes: ["studio-handoff"],
        });

        // Everything below still runs after navigation (a floating async
        // function isn't tied to this component's mount) — only the final
        // resolvePendingFirstMessage needs a listener, and the session page
        // registers one immediately on mount, well before uploads finish.

        // Persist home-composer images under 图片N so @图片1 stays meaningful.
        const uploads = meta?.pendingImageUploads ?? [];
        const asAttachments: ImageAttachment[] = [];
        if (uploads.length) notifyPendingFirstMessageStatus(sessionId, "正在上传图片引用…");
        for (const item of uploads) {
          try {
            const artifact = await uploadImageArtifact({
              sessionId,
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
        // source and create its analysis job before the model receives the turn.
        if (meta?.pendingVideoUploads?.length) {
          notifyPendingFirstMessageStatus(sessionId, "正在准备视频参考…");
        }
        for (const item of meta?.pendingVideoUploads ?? []) {
          const source = await uploadVideoArtifact({
            sessionId,
            file: item.file,
            authorized: item.authorized,
          });
          await startVideoAnalysis({ sourceArtifactId: source.id, goal: "both" });
        }

        const importedSheetIds: string[] = [];
        if (meta?.pendingSheetUploads?.length) {
          notifyPendingFirstMessageStatus(sessionId, "正在导入表格附件…");
        }
        for (const item of meta?.pendingSheetUploads ?? []) {
          const artifact = await uploadSheetArtifact({
            sessionId,
            file: item.file,
          });
          importedSheetIds.push(artifact.id);
        }

        let referencedArtifactIds =
          meta?.referencedArtifactIds?.filter(Boolean) ?? [];
        if (seedArtifactId && !referencedArtifactIds.includes(seedArtifactId)) {
          referencedArtifactIds = [...referencedArtifactIds, seedArtifactId];
        }
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
        if (importedSheetIds.length) {
          referencedArtifactIds = [
            ...referencedArtifactIds,
            ...importedSheetIds.filter((id) => !referencedArtifactIds.includes(id)),
          ];
        }

        notifyPendingFirstMessageStatus(sessionId, "正在理解需求…");
        // The session page owns the actual send from here — it's the only
        // mounted useChat instance that can call sendMessage. This also
        // implicitly creates the session server-side (bootstrap), with the
        // id already committed to and navigated to above.
        resolvePendingFirstMessage(sessionId, {
          model: requestModel,
          capabilityPresetId: selectedCapabilityPresetId ?? undefined,
          composerOptions: meta?.composerOptions,
          skillIds,
          referencedArtifactIds: referencedArtifactIds.length
            ? referencedArtifactIds
            : undefined,
          projectId: requestProjectId,
          bootstrapTitle: syntheticSession.title,
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "创建会话失败";
        if (handedOff) {
          failPendingFirstMessage(sessionId, errMessage);
          // Already navigated to the session page — it owns recovery from
          // here (the failure above already reported into it). Resetting
          // home-page state after handoff would be a no-op on an
          // unmounting component anyway.
          if (err instanceof StudioApiError && err.status === 401) {
            openLogin("login");
          }
          return;
        }
        if (err instanceof StudioApiError && err.status === 401) {
          setError("请先登录后再开始对话");
          openLogin("login");
        } else {
          setError(errMessage);
        }
        // Never lose what the user typed — Composer already cleared its
        // draft optimistically before this async work even started.
        setDraft(message);
      } finally {
        if (!handedOff) {
          setStarting(false);
          setDocking(false);
        }
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
      seedArtifactId,
      selectedSkillIds,
      starting,
    ],
  );

  const isCardActive = useCallback(
    (card: SceneCard) =>
      card.skillIds.every((id) => selectedSkillIds.includes(id)) &&
      (card.prompt ? draft.startsWith(card.prompt.slice(0, 12)) : true),
    [draft, selectedSkillIds],
  );

  return (
    <div
      className="studio-home-canvas studio-view-in relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-docking={docking ? "true" : "false"}
    >
      {/* Compact utility controls keep the canvas focused on the prompt. */}
      <div
        className={`pointer-events-none absolute right-5 top-4 z-[2] flex items-center gap-2 sm:right-8 sm:top-5 transition-opacity duration-200 ${
          docking ? "opacity-0" : "opacity-100"
        }`}
      >
        <Link
          href="/"
          title="返回首页"
          aria-label="返回首页"
          className="studio-home-utility pointer-events-auto inline-flex h-9 w-9 items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        </Link>
        <span
          className="studio-home-utility pointer-events-auto flex h-9 w-9 items-center justify-center"
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
        // Only the foreground tab may own this id — background kept-alive
        // tabs (see WorkspaceTabsHost) must not shadow it, or
        // document.getElementById/querySelector calls above could resolve
        // to the wrong tab's composer.
        id={active ? "studio-home-composer" : undefined}
        className={`studio-home-hero relative flex flex-col ${
          docking
            ? "min-h-0 flex-1"
            : "min-h-[61dvh] sm:min-h-[64dvh]"
        }`}
      >
        <div
          className={`studio-home-hero-inner flex min-h-0 flex-1 flex-col px-5 sm:px-10 ${
            docking
              ? "items-stretch justify-end pb-2 pt-0 sm:pb-3"
              : "items-center justify-center pb-8 pt-14 sm:pb-10 sm:pt-16"
          }`}
        >
          <div
            className={`w-full ${
              docking ? "mx-auto max-w-3xl" : "max-w-[760px]"
            }`}
          >
            {!docking ? (
              <div className="studio-home-intro mb-5 text-center">
                <p className="text-[13px] font-medium text-[#64748B]">新对话</p>
                <h1 className="mt-2 text-[28px] font-semibold leading-tight text-[#172033]">
                  今天想完成什么？
                </h1>
              </div>
            ) : null}
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
              onPrepareSend={() => {
                // The home page has no session id yet, so it cannot create a
                // thread bubble until createSession resolves. It can still
                // acknowledge the click before Composer starts local work.
                if (account) setStarting(true);
                return null;
              }}
              disabled={starting}
              model={model}
              onModelChange={setModel}
              capabilityPresetId={capabilityPresetId}
              onCapabilityPresetChange={setCapabilityPresetId}
              skillIds={selectedSkillIds}
              onSkillIdsChange={setSelectedSkillIds}
              error={error}
              onClearError={() => setError(null)}
              draftKey={`home-${tabId}`}
              // Kept-alive home tabs can briefly overlap while React commits a
              // tab switch. Names must be unique in that window.
              shareTransitionName={active ? `studio-composer-${tabId}` : null}
              placeholder={
                starting
                ? "正在进入对话…"
                  : "输入需求，或输入 @ 引用产物、/选择技能"
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
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <h2 className="text-[18px] font-semibold text-[#172033] sm:text-[20px]">
                工具与技能
              </h2>
              <p className="mt-1 text-[13px] text-[#718096]">
                选择一个分类，或直接从精选 Skills 开始。
              </p>
            </div>
            <Link href="/studio/tools" className="studio-section-link">
              查看全部工具
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {workbenchCategories.map((category) => {
              const Icon = category.icon;
              return (
                <Link
                  key={category.id}
                  href={studioToolCategoryHref(category.id)}
                  className="studio-cap-card studio-category-card group rounded-lg p-4 text-left"
                >
                  <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-[rgba(15, 23, 42,0.1)] text-[#0F172A]">
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <p className="text-[15px] font-semibold tracking-tight text-[#241E36]">
                    {category.name}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-[#8A8298]">
                    {category.summary}
                  </p>
                  <p className="mt-3 text-[11px] tabular-nums text-[#AAA2B2]">
                    {category.toolCount} 个工具
                    {category.skillCount > 0 ? ` · ${category.skillCount} 个技能` : ""}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="mb-4 mt-10">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[16px] font-semibold text-[#172033]">
                精选 Skills
              </h3>
              <Link href="/studio/skills" className="studio-section-link">
                查看全部
              </Link>
            </div>
            <p className="mt-1 text-[13px] text-[#8A8298]">
              点选后挂载技能，在上方描述任务即可。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sceneCards.map((card) => (
              <CapabilityCard
                key={card.key}
                card={card}
                active={isCardActive(card)}
                disabled={starting}
                onClick={() => applyCard(card)}
                className="studio-skill-card"
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
export default function StudioHomeView({ active, tabId }: { active: boolean; tabId: string }) {
  return (
    <Suspense fallback={<StudioHomeFallback />}>
      <StudioHomeInner active={active} tabId={tabId} />
    </Suspense>
  );
}
