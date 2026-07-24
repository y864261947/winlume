"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Code2, FileText, ImageIcon, Sparkles } from "lucide-react";
import Composer from "@/components/studio/Composer";
import { useModals } from "@/components/providers";
import {
  createSession,
  getGatewayUserId,
  setPendingFirstMessage,
  StudioApiError,
} from "@/lib/studio/api";

const chips = [
  { label: "写一段说明文案", icon: FileText },
  { label: "分析一段代码", icon: Code2 },
  { label: "生成图片创意", icon: ImageIcon },
  { label: "梳理今日待办", icon: Sparkles },
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
  const [prefillSkillId, setPrefillSkillId] = useState<string | null>(null);

  // Skills page "使用示例" → /studio?skill=&prompt=
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    const skill = searchParams.get("skill");
    if (prompt) setDraft(prompt);
    if (skill) setPrefillSkillId(skill);
  }, [searchParams]);

  const startChat = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || starting) return;

      if (!getGatewayUserId()) {
        setError("请先登录后再开始对话");
        openLogin("login");
        return;
      }

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
          skillIds: prefillSkillId ? [prefillSkillId] : undefined,
        });
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
    [model, openLogin, prefillSkillId, router, starting],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <h1 className="text-center text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
          今天想完成什么？
        </h1>
        <p className="mt-3 max-w-md text-center text-sm leading-6 text-ink-500">
          输入需求即可开始新对话。支持流式回复，历史会自动保存。
        </p>

        {prefillSkillId && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
            <Sparkles className="h-3.5 w-3.5" />
            已关联 Skill：{prefillSkillId}
          </p>
        )}

        <div className="mt-8 flex max-w-xl flex-wrap items-center justify-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={starting}
              onClick={() => setDraft(chip.label)}
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
        error={error}
        onClearError={() => setError(null)}
        placeholder={starting ? "正在创建会话…" : "描述你想完成的任务…"}
      />
    </div>
  );
}
