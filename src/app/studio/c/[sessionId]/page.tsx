"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LoaderCircle, PanelRight } from "lucide-react";
import ArtifactPanel from "@/components/studio/ArtifactPanel";
import ArtifactPreview from "@/components/studio/ArtifactPreview";
import ChatThread from "@/components/studio/ChatThread";
import Composer from "@/components/studio/Composer";
import {
  useStudioChat,
  type ArtifactEventPayload,
} from "@/components/studio/useStudioChat";
import { useModals } from "@/components/providers";
import type { Artifact, Message, Session } from "@/lib/agent/types";
import {
  getArtifact,
  getSessionBundle,
  listArtifacts,
  patchSession,
  takePendingFirstMessage,
  StudioApiError,
} from "@/lib/studio/api";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";

type MobileTab = "chat" | "works";

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
  const [pinnedSkillIds, setPinnedSkillIds] = useState<string[]>([]);
  const pendingSentRef = useRef(false);

  // Artifacts
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  const onUnauthorized = useCallback(() => {
    openLogin("login");
  }, [openLogin]);

  const refreshArtifacts = useCallback(
    async (opts?: { preferId?: string; openPreview?: boolean }) => {
      const sid = session?.id ?? sessionId;
      if (!sid) return;
      setArtifactsLoading(true);
      setArtifactsError(null);
      try {
        const list = await listArtifacts(sid);
        setArtifacts(list);
        setSelectedId((prev) => {
          if (opts?.preferId && list.some((a) => a.id === opts.preferId)) {
            return opts.preferId;
          }
          if (prev && list.some((a) => a.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
        if (opts?.openPreview) setPreviewOpen(true);
      } catch (err) {
        if (err instanceof StudioApiError && err.status === 401) {
          setArtifactsError("请先登录");
        } else {
          setArtifactsError(
            err instanceof Error ? err.message : "加载作品失败",
          );
        }
      } finally {
        setArtifactsLoading(false);
      }
    },
    [session?.id, sessionId],
  );

  const onArtifact = useCallback(
    (event: ArtifactEventPayload) => {
      void refreshArtifacts({ preferId: event.artifactId, openPreview: true });
      setMobileTab("works");
    },
    [refreshArtifacts],
  );

  const chat = useStudioChat({
    sessionId: session?.id ?? sessionId,
    initialMessages,
    model: session?.model ?? FALLBACK_DEFAULT_MODEL,
    onUnauthorized,
    onArtifact,
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
        setPinnedSkillIds(bundle.session.pinnedSkillIds ?? []);
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

  const onPinnedSkillIdsChange = useCallback(
    async (ids: string[]) => {
      setPinnedSkillIds(ids);
      const sid = session?.id ?? sessionId;
      if (!sid) return;
      try {
        const updated = await patchSession(sid, { pinnedSkillIds: ids });
        setSession(updated);
        setPinnedSkillIds(updated.pinnedSkillIds ?? ids);
      } catch (err) {
        // Keep optimistic pins; surface auth so user can re-login
        if (err instanceof StudioApiError && err.status === 401) {
          openLogin("login");
        }
      }
    },
    [session?.id, sessionId, openLogin],
  );

  // Load artifacts when session is ready
  useEffect(() => {
    if (!session?.id) return;
    void refreshArtifacts();
  }, [session?.id, refreshArtifacts]);

  // Load selected artifact content
  useEffect(() => {
    if (!selectedId) {
      setContent(null);
      setContentError(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    void (async () => {
      try {
        const data = await getArtifact(selectedId);
        if (cancelled) return;
        setContent(data.content ?? "");
      } catch (err) {
        if (cancelled) return;
        setContent(null);
        setContentError(
          err instanceof Error ? err.message : "读取作品失败",
        );
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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
        setPinnedSkillIds(bundle.session.pinnedSkillIds ?? []);
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

  const selected = useMemo(
    () => artifacts.find((a) => a.id === selectedId) ?? null,
    [artifacts, selectedId],
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setPreviewOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-[#8A8298]">
        <LoaderCircle className="h-4 w-4 animate-spin text-[#C2410C]" />
        加载会话…
      </div>
    );
  }

  if (loadError && !session) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-[#615A73]">{loadError}</p>
        <Link
          href="/studio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C2410C] hover:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" />
          返回开始创作
        </Link>
      </div>
    );
  }

  const chatColumn = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ChatThread
        messages={chat.messages}
        streaming={chat.streaming}
        emptyHint="发送一条消息，开始与 WinLume 对话。"
      />
      <Composer
        onSend={(text, meta) =>
          chat.send(text, {
            // Turn-only skillIds; runtime merges session pins server-side
            skillIds: meta?.skillIds,
          })
        }
        onStop={chat.stop}
        streaming={chat.streaming}
        model={chat.model}
        onModelChange={chat.setModel}
        pinnedSkillIds={pinnedSkillIds}
        onPinnedSkillIdsChange={(ids) => {
          void onPinnedSkillIdsChange(ids);
        }}
        error={chat.error}
        onClearError={chat.clearError}
      />
    </div>
  );

  const worksColumn = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ArtifactPanel
        artifacts={artifacts}
        selectedId={selectedId}
        onSelect={handleSelect}
        loading={artifactsLoading}
        error={artifactsError}
        onRefresh={() => void refreshArtifacts()}
        className="max-h-[40%] w-full shrink-0 border-l-0 border-b"
      />
      <ArtifactPreview
        artifact={selected}
        content={content}
        loading={contentLoading}
        error={contentError}
        className="min-h-0 flex-1 border-l-0"
      />
    </div>
  );

  return (
    <div className="studio-view-in flex min-h-0 flex-1 flex-col">
      <header className="studio-glass-soft flex shrink-0 items-center gap-3 border-b border-white/50 px-4 py-3 sm:px-6">
        <Link
          href="/studio"
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#615A73] transition hover:bg-white/60 hover:text-[#241E36]"
          title="开始创作"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">返回</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-[#241E36]">{title}</h1>
          {session?.model ? (
            <p className="truncate font-mono text-[11px] text-[#8A8298]">
              {chat.model || session.model}
            </p>
          ) : null}
        </div>
        {!previewOpen && selectedId ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="hidden h-8 items-center gap-1.5 rounded-[10px] border border-white/70 bg-white/50 px-2.5 text-xs text-[#615A73] transition hover:bg-white md:inline-flex"
            title="打开预览"
          >
            <PanelRight className="h-3.5 w-3.5" />
            预览
          </button>
        ) : null}
        <div className="flex rounded-[10px] border border-white/70 bg-white/40 p-0.5 md:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition ${
              mobileTab === "chat"
                ? "bg-gradient-to-br from-[#F2994A] to-[#C2410C] text-white"
                : "text-[#615A73] hover:bg-white/60"
            }`}
          >
            对话
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("works")}
            className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition ${
              mobileTab === "works"
                ? "bg-gradient-to-br from-[#F2994A] to-[#C2410C] text-white"
                : "text-[#615A73] hover:bg-white/60"
            }`}
          >
            作品
            {artifacts.length > 0 ? (
              <span className="ml-1 tabular-nums opacity-80">
                {artifacts.length}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      {/* Mobile: tabbed */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mobileTab === "chat" ? chatColumn : worksColumn}
      </div>

      {/* Desktop: chat | list | preview */}
      <div className="hidden min-h-0 flex-1 md:flex">
        {chatColumn}
        <ArtifactPanel
          artifacts={artifacts}
          selectedId={selectedId}
          onSelect={handleSelect}
          loading={artifactsLoading}
          error={artifactsError}
          onRefresh={() => void refreshArtifacts()}
          className="w-64 shrink-0"
        />
        {previewOpen ? (
          <ArtifactPreview
            artifact={selected}
            content={content}
            loading={contentLoading}
            error={contentError}
            onClose={() => setPreviewOpen(false)}
            className="w-96 shrink-0"
          />
        ) : null}
      </div>
    </div>
  );
}
