"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import ChatThread from "@/components/studio/ChatThread";
import Composer from "@/components/studio/Composer";
import { useStudioChat } from "@/components/studio/useStudioChat";
import { useModals } from "@/components/providers";
import type { Message, Session } from "@/lib/agent/types";
import {
  getSessionBundle,
  takePendingFirstMessage,
  StudioApiError,
} from "@/lib/studio/api";

export default function StudioSessionPage() {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const { openLogin, account } = useModals();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[] | undefined>(
    undefined,
  );
  const pendingSentRef = useRef(false);

  const onUnauthorized = useCallback(() => {
    openLogin("login");
  }, [openLogin]);

  const chat = useStudioChat({
    sessionId: session?.id ?? sessionId,
    initialMessages,
    model: session?.model ?? "gpt-4o-mini",
    onUnauthorized,
  });

  useEffect(() => {
    if (!sessionId) {
      setLoadError("无效的会话");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const bundle = await getSessionBundle(sessionId);
        if (cancelled) return;
        setSession(bundle.session);
        setInitialMessages(bundle.messages);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof StudioApiError && err.status === 401) {
          setLoadError("请先登录后查看会话");
          openLogin("login");
        } else if (err instanceof StudioApiError && err.status === 404) {
          setLoadError("会话不存在或无权访问");
        } else {
          setLoadError(err instanceof Error ? err.message : "加载会话失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, openLogin]);

  // Auto-send first message handed off from /studio home
  useEffect(() => {
    if (loading || !session || pendingSentRef.current) return;
    const pending = takePendingFirstMessage(session.id);
    if (!pending) return;
    pendingSentRef.current = true;
    if (pending.model) chat.setModel(pending.model);
    void chat.send(pending.message, {
      model: pending.model ?? chat.model,
      skillIds: pending.skillIds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once after load
  }, [loading, session]);

  // Retry load after login
  useEffect(() => {
    if (!account || !sessionId || session || !loadError) return;
    let cancelled = false;
    (async () => {
      try {
        const bundle = await getSessionBundle(sessionId);
        if (cancelled) return;
        setSession(bundle.session);
        setInitialMessages(bundle.messages);
        setLoadError(null);
      } catch {
        /* keep error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, sessionId, session, loadError]);

  const title = useMemo(
    () => session?.title || "对话",
    [session?.title],
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-ink-500">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        加载会话…
      </div>
    );
  }

  if (loadError && !session) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-ink-600">{loadError}</p>
        <Link
          href="/studio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回新对话
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <Link
          href="/studio"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition hover:bg-canvas hover:text-ink-800"
          title="新对话"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">返回</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-ink-900">{title}</h1>
          {session?.model ? (
            <p className="truncate font-mono text-[11px] text-ink-400">
              {chat.model || session.model}
            </p>
          ) : null}
        </div>
      </header>

      <ChatThread
        messages={chat.messages}
        streaming={chat.streaming}
        emptyHint="发送一条消息，开始与 WinLume 对话。"
      />

      <Composer
        onSend={(text, meta) =>
          chat.send(text, {
            skillIds: meta?.skillIds,
          })
        }
        onStop={chat.stop}
        streaming={chat.streaming}
        model={chat.model}
        onModelChange={chat.setModel}
        error={chat.error}
        onClearError={chat.clearError}
      />
    </div>
  );
}
