"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle, Sparkles, UserRound } from "lucide-react";
import type { UiChatMessage } from "./useStudioChat";

export type ChatThreadProps = {
  messages: UiChatMessage[];
  streaming?: boolean;
  emptyHint?: string;
};

function Bubble({ message }: { message: UiChatMessage }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  if (message.role === "system" || message.role === "tool") {
    return (
      <div className="flex justify-center px-4">
        <p className="max-w-2xl rounded-[12px] bg-white/50 px-3 py-1.5 text-center text-xs text-[#8A8298]">
          {message.content || message.role}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 px-4 sm:px-6 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-gradient-to-br from-[#F2994A] to-[#C2410C] text-white shadow-[0_4px_10px_-4px_rgba(194,65,12,0.55)]"
            : "bg-white/80 text-[#C2410C] ring-1 ring-white/90"
        }`}
        aria-hidden
      >
        {isUser ? (
          <UserRound className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </span>
      <div
        className={`min-w-0 max-w-[min(100%,42rem)] rounded-[18px] px-4 py-3 text-sm leading-6 ${
          isUser ? "studio-user-bubble shadow-md" : "studio-assistant-bubble"
        }`}
      >
        {isAssistant && !message.content && message.streaming ? (
          <span className="inline-flex items-center gap-2 text-[#8A8298]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            正在思考…
          </span>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.streaming && message.content ? (
              <span
                className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#F2994A] align-middle"
                aria-hidden
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatThread({
  messages,
  streaming = false,
  emptyHint = "发送一条消息开始对话。",
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p className="text-center text-sm text-ink-400">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}
