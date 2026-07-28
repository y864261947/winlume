"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TransitionEvent,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  LoaderCircle,
  PanelLeftClose,
  PanelRight,
} from "lucide-react";
import ArtifactPanel from "@/components/studio/ArtifactPanel";
import ArtifactPreview from "@/components/studio/ArtifactPreview";
import ChatThread from "@/components/studio/ChatThread";
import Composer from "@/components/studio/Composer";
import { useResizablePanel } from "@/components/studio/useResizablePanel";
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
  peekPendingFirstMessage,
  takePendingFirstMessage,
  StudioApiError,
} from "@/lib/studio/api";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";

type MobileTab = "chat" | "works";

const PREVIEW_WIDTH_KEY = "winlume-artifact-preview-width";
const LIST_WIDTH_KEY = "winlume-artifact-list-width";

function optimisticUserMessage(
  sessionId: string,
  text: string,
): Message {
  return {
    id: `pending-user-${sessionId}`,
    sessionId,
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  };
}

export default function StudioSessionPage() {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const { openLogin, account } = useModals();

  const [loading, setLoading] = useState(true);
  const [hasHandoff, setHasHandoff] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [initialMessages, setInitialMessages] = useState<
    Message[] | undefined
  >(undefined);

  // Paint optimistic user bubble before paint when arriving from home send
  useLayoutEffect(() => {
    if (!sessionId) return;
    const pending = peekPendingFirstMessage(sessionId);
    if (!pending?.message) return;
    setHasHandoff(true);
    setLoading(false);
    setInitialMessages([optimisticUserMessage(sessionId, pending.message)]);
  }, [sessionId]);
  const [pinnedSkillIds, setPinnedSkillIds] = useState<string[]>([]);
  const pendingSentRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Artifacts
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * Works rail defaults collapsed. Layout width and visual open are split so
   * close can animate transform/opacity before releasing the flex slot.
   */
  const [worksRailOpen, setWorksRailOpen] = useState(false);
  /** Discrete layout slot (px). 0 when fully closed after exit transition. */
  const [worksRailLayoutWidth, setWorksRailLayoutWidth] = useState(0);
  /** Preview pane within the rail. */
  const [previewOpen, setPreviewOpen] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(
    null,
  );
  /** Pulse edge tab when new work arrives while rail is collapsed. */
  const [edgePulse, setEdgePulse] = useState(false);
  /**
   * User explicitly hid the rail — suppress further auto-open this visit
   * until they open it manually (header / edge tab / chat link).
   */
  const userCollapsedWorksRef = useRef(false);

  // NewMax-style resizable side panes (persisted)
  const listPane = useResizablePanel({
    storageKey: LIST_WIDTH_KEY,
    defaultWidth: 256,
    minWidth: 200,
    maxWidth: 360,
    invert: true,
  });
  const previewPane = useResizablePanel({
    storageKey: PREVIEW_WIDTH_KEY,
    defaultWidth: 384,
    minWidth: 280,
    maxWidth: 720,
    invert: true,
  });

  const onUnauthorized = useCallback(() => {
    openLogin("login");
  }, [openLogin]);

  const worksRailOpenRef = useRef(worksRailOpen);
  useEffect(() => {
    worksRailOpenRef.current = worksRailOpen;
  }, [worksRailOpen]);

  const contentRailWidth =
    listPane.width + (previewOpen ? previewPane.width : 0);

  // While open, keep layout slot in sync with resizes / preview toggle
  useEffect(() => {
    if (worksRailOpen) {
      setWorksRailLayoutWidth(contentRailWidth);
    }
  }, [worksRailOpen, contentRailWidth]);

  const openWorksRail = useCallback(
    (opts?: {
      preview?: boolean;
      animated?: boolean;
      /** true = user action (clears collapse lock); false = auto from write */
      manual?: boolean;
    }) => {
      if (opts?.manual !== false) {
        userCollapsedWorksRef.current = false;
      } else if (userCollapsedWorksRef.current) {
        return;
      }
      const showPreview = opts?.preview !== false;
      if (showPreview) setPreviewOpen(true);
      const target =
        listPane.width +
        (showPreview || previewOpen ? previewPane.width : 0);
      // Allocate flex slot first, then slide/fade in (interruptible CSS)
      setWorksRailLayoutWidth(target);
      setEdgePulse(false);
      requestAnimationFrame(() => {
        setWorksRailOpen(true);
      });
    },
    [listPane.width, previewPane.width, previewOpen],
  );

  const closeWorksRail = useCallback(() => {
    userCollapsedWorksRef.current = true;
    setWorksRailOpen(false);
    setPreviewOpen(false);
    // worksRailLayoutWidth → 0 on transition end (see shell handler)
  }, []);

  const onWorksRailTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.propertyName !== "opacity" && e.propertyName !== "transform") {
        return;
      }
      if (!worksRailOpenRef.current) {
        setWorksRailLayoutWidth(0);
      }
    },
    [],
  );

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
        if (opts?.openPreview) {
          // Auto path — respects userCollapsedWorksRef inside openWorksRail
          openWorksRail({ preview: true, animated: false, manual: false });
        }
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
    [session?.id, sessionId, openWorksRail],
  );

  const flashArtifact = useCallback((id: string) => {
    setFlashId(id);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashId(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const onArtifact = useCallback(
    (event: ArtifactEventPayload) => {
      // write_artifact (or auto-persist) → refresh list; open only if user hasn't hidden
      void refreshArtifacts({ preferId: event.artifactId, openPreview: true });
      flashArtifact(event.artifactId);
      if (!userCollapsedWorksRef.current) {
        setMobileTab("works");
        openWorksRail({ preview: true, animated: true, manual: false });
      } else {
        // Collapsed: pulse edge tab so user knows something new arrived
        setEdgePulse(true);
      }
    },
    [refreshArtifacts, flashArtifact, openWorksRail],
  );

  const reloadContent = useCallback(async () => {
    if (!selectedId) return;
    setContentLoading(true);
    setContentError(null);
    try {
      const data = await getArtifact(selectedId);
      setContent(data.content ?? "");
    } catch (err) {
      setContent(null);
      setContentError(err instanceof Error ? err.message : "读取作品失败");
    } finally {
      setContentLoading(false);
    }
  }, [selectedId]);

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
        // Don't wipe optimistic first bubble while pending send is still queued
        const stillPending = peekPendingFirstMessage(sessionId);
        if (bundle.messages.length > 0) {
          setInitialMessages(bundle.messages);
        } else if (stillPending?.message) {
          setInitialMessages([
            optimisticUserMessage(sessionId, stillPending.message),
          ]);
        } else {
          setInitialMessages(bundle.messages);
        }
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
    setHasHandoff(false);
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

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      // Manual pick: open without the big auto-reveal flourish
      openWorksRail({ preview: true, animated: false, manual: true });
    },
    [openWorksRail],
  );

  const artifactsByMessageId = useMemo(() => {
    const map = new Map<string, Artifact[]>();
    for (const a of artifacts) {
      if (!a.messageId) continue;
      const list = map.get(a.messageId) ?? [];
      list.push(a);
      map.set(a.messageId, list);
    }
    return map;
  }, [artifacts]);

  const openArtifactFromChat = useCallback(
    (artifactId: string) => {
      setSelectedId(artifactId);
      openWorksRail({ preview: true, animated: true, manual: true });
      setMobileTab("works");
      flashArtifact(artifactId);
    },
    [flashArtifact, openWorksRail],
  );

  const jumpToMessage = useCallback((messageId: string) => {
    setMobileTab("chat");
    setHighlightMessageId(messageId);
  }, []);

  // Full-page block only when cold-open (no handoff) or hard error
  if (loading && !hasHandoff) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-[#8A8298]">
        <LoaderCircle className="h-4 w-4 animate-spin text-[#0F172A]" />
        加载中…
      </div>
    );
  }

  if (loadError && !session && !hasHandoff) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-[#615A73]">{loadError}</p>
        <Link
          href="/studio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0F172A] hover:opacity-80"
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
        streaming={chat.streaming || (hasHandoff && loading)}
        emptyHint="发送一条消息，开始与 WinLume 对话。"
        highlightMessageId={highlightMessageId}
        onHighlightConsumed={() => setHighlightMessageId(null)}
        artifactsByMessageId={artifactsByMessageId}
        onOpenArtifact={openArtifactFromChat}
      />
      <Composer
        onSend={(text, meta) =>
          chat.send(text, {
            // Turn-only skillIds; runtime merges session pins server-side
            skillIds: meta?.skillIds,
          })
        }
        onStop={chat.stop}
        streaming={chat.streaming || (hasHandoff && loading)}
        disabled={loading && hasHandoff}
        model={chat.model}
        onModelChange={chat.setModel}
        pinnedSkillIds={pinnedSkillIds}
        onPinnedSkillIdsChange={(ids) => {
          void onPinnedSkillIdsChange(ids);
        }}
        error={chat.error}
        onClearError={chat.clearError}
        queue={chat.queue}
        onRemoveFromQueue={chat.removeFromQueue}
        onClearQueue={chat.clearQueue}
        draftKey={session?.id ?? sessionId}
        placeholder={
          hasHandoff && loading ? "正在连接…" : undefined
        }
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
        flashId={flashId}
        className="max-h-[40%] w-full shrink-0 border-l-0 border-b"
      />
      <ArtifactPreview
        artifact={selected}
        content={content}
        loading={contentLoading}
        error={contentError}
        onClose={() => setPreviewOpen(false)}
        onRefresh={() => void reloadContent()}
        onJumpToMessage={jumpToMessage}
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
        {/* Desktop: always-visible works rail toggle */}
        <button
          type="button"
          onClick={() => {
            if (worksRailOpen) closeWorksRail();
            else
              openWorksRail({
                preview: Boolean(selectedId) || artifacts.length > 0,
                manual: true,
              });
          }}
          className={`hidden h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-xs font-medium transition md:inline-flex ${
            worksRailOpen
              ? "border-[rgba(15, 23, 42,0.25)] bg-[rgba(15, 23, 42,0.08)] text-[#0F172A]"
              : "border-white/70 bg-white/50 text-[#615A73] hover:bg-white"
          }`}
          title={worksRailOpen ? "收起作品区" : "打开作品区"}
          aria-pressed={worksRailOpen}
        >
          {worksRailOpen ? (
            <PanelLeftClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRight className="h-3.5 w-3.5" />
          )}
          作品
          {artifacts.length > 0 ? (
            <span className="tabular-nums opacity-80">{artifacts.length}</span>
          ) : null}
        </button>
        {worksRailOpen && !previewOpen ? (
          <button
            type="button"
            onClick={() => {
              userCollapsedWorksRef.current = false;
              setPreviewOpen(true);
            }}
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
                ? "bg-gradient-to-br from-[#334155] to-[#0F172A] text-white"
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
                ? "bg-gradient-to-br from-[#334155] to-[#0F172A] text-white"
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

      {/* Desktop: chat | works rail — shell stays mounted; layout width discrete, slide via CSS */}
      <div className="relative hidden min-h-0 flex-1 md:flex">
        {chatColumn}

        <div
          className="studio-works-shell border-l border-white/40"
          data-open={worksRailOpen ? "true" : "false"}
          style={{ width: worksRailLayoutWidth }}
          aria-hidden={!worksRailOpen}
        >
          <div
            className="studio-works-shell-inner relative flex h-full min-w-0"
            style={{ width: contentRailWidth || listPane.width + previewPane.width }}
            onTransitionEnd={onWorksRailTransitionEnd}
          >
            <div
              className="relative flex h-full shrink-0 overflow-hidden"
              style={{ width: listPane.width }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="调整作品列表宽度"
                onPointerDown={listPane.onHandlePointerDown}
                className="absolute inset-y-0 left-0 z-[2] w-1.5 cursor-col-resize hover:bg-[rgba(15, 23, 42,0.25)] active:bg-[rgba(15, 23, 42,0.4)]"
              />
              <ArtifactPanel
                artifacts={artifacts}
                selectedId={selectedId}
                onSelect={handleSelect}
                loading={artifactsLoading}
                error={artifactsError}
                onRefresh={() => void refreshArtifacts()}
                flashId={flashId}
                className="w-full min-w-0"
              />
            </div>

            <div
              className="studio-works-preview-shell relative h-full min-w-0 overflow-hidden"
              data-open={previewOpen ? "true" : "false"}
              style={{ width: previewOpen ? previewPane.width : 0 }}
              aria-hidden={!previewOpen}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="调整预览宽度"
                onPointerDown={previewPane.onHandlePointerDown}
                className="absolute inset-y-0 left-0 z-[2] w-1.5 cursor-col-resize hover:bg-[rgba(15, 23, 42,0.25)] active:bg-[rgba(15, 23, 42,0.4)]"
              />
              <ArtifactPreview
                artifact={selected}
                content={content}
                loading={contentLoading}
                error={contentError}
                onClose={() => setPreviewOpen(false)}
                onRefresh={() => void reloadContent()}
                onJumpToMessage={jumpToMessage}
                className="h-full w-full min-w-0"
              />
            </div>
          </div>
        </div>

        {!worksRailOpen && worksRailLayoutWidth === 0 ? (
          <button
            type="button"
            className="studio-works-edge-tab"
            data-pulse={edgePulse || flashId ? "true" : "false"}
            onClick={() => openWorksRail({ preview: true, manual: true })}
            title="打开作品区"
            aria-label={`打开作品区${artifacts.length ? `，共 ${artifacts.length} 个` : ""}`}
          >
            <PanelRight className="h-4 w-4" />
            <span className="studio-works-edge-label">作品</span>
            {artifacts.length > 0 ? (
              <span className="rounded-full bg-[rgba(15, 23, 42,0.12)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#0F172A]">
                {artifacts.length}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
