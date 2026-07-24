"use client";

import { useState } from "react";
import { ArrowUp, Code2, FileText, ImageIcon, Sparkles } from "lucide-react";

const chips = [
  { label: "写一段说明文案", icon: FileText },
  { label: "分析一段代码", icon: Code2 },
  { label: "生成图片创意", icon: ImageIcon },
  { label: "梳理今日待办", icon: Sparkles },
] as const;

export default function StudioHomePage() {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <h1 className="text-center text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
          今天想完成什么？
        </h1>
        <p className="mt-3 max-w-md text-center text-sm leading-6 text-ink-500">
          在下方输入需求即可开始。会话与流式回复将在后续任务接入。
        </p>

        <div className="mt-8 flex max-w-xl flex-wrap items-center justify-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setDraft(chip.label)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
            >
              <chip.icon className="h-3.5 w-3.5 text-ink-400" />
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line bg-surface px-4 py-4 sm:px-6">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-canvas p-2 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            // Task 5: create session on first send
          }}
        >
          <label className="sr-only" htmlFor="studio-prompt">
            输入你的需求
          </label>
          <textarea
            id="studio-prompt"
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="描述你想完成的任务…"
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            title="发送（后续任务接入）"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
            <span className="sr-only">发送</span>
          </button>
        </form>
      </div>
    </div>
  );
}
