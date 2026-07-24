"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Megaphone,
  Search,
  Sparkles,
} from "lucide-react";
import Composer from "@/components/studio/Composer";
import { useModals } from "@/components/providers";
import {
  createSession,
  getGatewayUserId,
  setPendingFirstMessage,
  StudioApiError,
} from "@/lib/studio/api";

/** Empty-state scene chips: prefill prompt + skill ids (demo → prefill only). */
const SCENE_CHIPS = [
  {
    label: "做宣传内容",
    icon: Megaphone,
    prompt:
      "为一家新开业的社区咖啡店做一套开业宣传方案：含朋友圈文案、海报主标题副文、短视频脚本大纲，语气亲切有感染力。",
    skillIds: ["marketing-content-creator", "design-brand-guardian"],
  },
  {
    label: "做调研报告",
    icon: Search,
    prompt:
      "帮我做一份「智能办公软件」竞品调研提纲：市场格局、核心竞品对比维度、用户痛点与机会点，并给出简要财务视角的关注指标。",
    skillIds: ["product-trend-researcher", "finance-financial-analyst"],
  },
  {
    label: "处理文件",
    icon: FileText,
    prompt:
      "总结以下内容的核心观点、关键结论与可执行建议（请按条目输出，必要时补充缺失信息的假设）。\n\n【在此粘贴要处理的文本或要点】",
    skillIds: ["engineering-technical-writer"],
  },
  {
    label: "小红书种草",
    icon: Sparkles,
    prompt:
      "写三篇小红书种草笔记：主题是「居家手冲咖啡入门」，要求有标题、正文、emoji 与话题标签，风格真实有共鸣、不硬广。",
    skillIds: ["marketing-xiaohongshu-specialist"],
  },
] as const;

const DEFAULT_MODEL = "gpt-4o-mini";

export default function StudioHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openLogin } = useModals();
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

  // Skills page "使用示例" → /studio?skill=&prompt=
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    const skill = searchParams.get("skill");
    if (prompt) setDraft(prompt);
    if (skill) setSelectedSkillIds([skill]);
  }, [searchParams]);

  const applySceneChip = useCallback(
    (chip: (typeof SCENE_CHIPS)[number]) => {
      setDraft(chip.prompt);
      setSelectedSkillIds([...chip.skillIds]);
    },
    [],
  );

  const startChat = useCallback(
    async (text: string, meta?: { skillIds?: string[] }) => {
      const message = text.trim();
      if (!message || starting) return;

      if (!getGatewayUserId()) {
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
        const session = await createSession({
          model: model.trim() || DEFAULT_MODEL,
          title: title || "新对话",
        });
        setPendingFirstMessage({
          sessionId: session.id,
          message,
          model: model.trim() || DEFAULT_MODEL,
          skillIds,
        });
        // Clear local selection (Composer also clears after send)
        setSelectedSkillIds([]);
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
    [model, openLogin, router, selectedSkillIds, starting],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <h1 className="text-center text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
          今天想完成什么？
        </h1>
        <p className="mt-3 max-w-md text-center text-sm leading-6 text-ink-500">
          输入需求即可开始新对话。可点场景芯片预填提示与 Skills，或在输入框用 / 选择技能。
        </p>

        {selectedSkillIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {selectedSkillIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {id}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-8 flex max-w-xl flex-wrap items-center justify-center gap-2">
          {SCENE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={starting}
              onClick={() => applySceneChip(chip)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
            >
              <chip.icon className="h-3.5 w-3.5 text-ink-400" />
              {chip.label}
            </button>
          ))}
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
        placeholder={starting ? "正在创建会话…" : "描述你想完成的任务…"}
      />
    </div>
  );
}
