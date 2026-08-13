"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Modal from "@/components/Modal";
import {
  deleteSession,
  getSessionBundle,
  listSessions,
  patchSession,
} from "@/lib/studio/api";
import type { Message, Session } from "@/lib/agent/types";

type SearchItem =
  | { kind: "action"; id: "new-chat" }
  | { kind: "session"; session: Session };

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupLabel(iso: string, now: number) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "更早";
  const today = startOfDay(new Date(now));
  const day = startOfDay(new Date(time));
  const diff = today - day;
  if (diff === 0) return "今天";
  if (diff === 86_400_000) return "昨天";
  if (diff < 7 * 86_400_000) return "近 7 天";
  return "更早";
}

function relativeTime(iso: string, now: number) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.max(1, Math.round((now - time) / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function previewText(message: Message) {
  const text = message.content.replace(/\s+/g, " ").trim();
  return text.length > 420 ? `${text.slice(0, 420)}…` : text;
}

function visiblePreviewMessages(messages: Message[]) {
  return messages.filter((message) => {
    if (message.role !== "user" && message.role !== "assistant") return false;
    if (message.presentation?.kind === "workflow_run") return false;
    return Boolean(message.content.trim());
  });
}

export default function StudioSearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} label="快速搜索" size="overlay">
      <SearchPanel onClose={onClose} />
    </Modal>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [preview, setPreview] = useState<Message[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const now = Date.now();
  const currentId = pathname.startsWith("/studio/c/") ? pathname.slice("/studio/c/".length) : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listSessions()
      .then((items) => {
        if (!cancelled) {
          setSessions([...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
        }
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo<SearchItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matched = sessions.filter((session) => {
      if (!q) return true;
      return session.title.toLowerCase().includes(q) || session.model.toLowerCase().includes(q);
    });
    return [{ kind: "action", id: "new-chat" }, ...matched.map((session) => ({ kind: "session" as const, session }))];
  }, [query, sessions]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(Math.max(0, items.length - 1));
  }, [activeIndex, items.length]);

  const active = items[activeIndex] ?? null;

  useEffect(() => {
    if (!active || active.kind !== "session") {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void getSessionBundle(active.session.id)
      .then((bundle) => {
        if (!cancelled) setPreview(visiblePreviewMessages(bundle.messages));
      })
      .catch(() => {
        if (!cancelled) setPreview([]);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    document.getElementById(`studio-search-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function go(item: SearchItem) {
    const href =
      item.kind === "action" ? "/studio" : `/studio/c/${encodeURIComponent(item.session.id)}`;
    router.push(href);
    onClose();
  }

  function startEdit(session: Session) {
    setEditingId(session.id);
    setEditTitle(session.title || "");
  }

  async function saveEdit() {
    if (!editingId) return;
    const title = editTitle.trim() || "未命名对话";
    const updated = await patchSession(editingId, { title });
    setSessions((current) => current.map((session) => (session.id === updated.id ? updated : session)));
    setEditingId(null);
  }

  async function remove(session: Session) {
    if (!window.confirm(`删除「${session.title || "未命名对话"}」？`)) return;
    await deleteSession(session.id);
    setSessions((current) => current.filter((item) => item.id !== session.id));
    if (currentId === session.id) router.push("/studio");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (editingId) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing && active) {
      event.preventDefault();
      event.stopPropagation();
      go(active);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e" && active?.kind === "session") {
      event.preventDefault();
      startEdit(active.session);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && active?.kind === "session") {
      event.preventDefault();
      void remove(active.session);
    }
  }

  let lastGroup = "";

  return (
    <form
      className="studio-search-panel flex h-full flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_28px_80px_-24px_rgba(36,30,54,0.4)]"
      onSubmit={(event) => {
        event.preventDefault();
        if (editingId || !active) return;
        go(active);
      }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[#ece7df] px-4 py-3.5">
        <Search className="size-4 shrink-0 text-[#8A8298]" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="搜索对话…"
          aria-label="搜索对话"
          className="studio-search-field w-full bg-transparent text-sm text-[#241E36] placeholder:text-[#8A8298]"
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-r border-[#ece7df] p-2">
          {loading ? (
            <p className="flex items-center gap-1.5 px-3 py-6 text-sm text-[#8A8298]">
              <LoaderCircle className="size-4 animate-spin" />
              正在加载…
            </p>
          ) : (
            items.map((item, index) => {
              if (item.kind === "action") {
                return (
                  <button
                    key="new-chat"
                    type="button"
                    id={`studio-search-option-${index}`}
                    onClick={() => go(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`mb-3 flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm outline-none focus-visible:outline-none ${
                      index === activeIndex ? "bg-[#f3efe8] text-[#241E36]" : "text-[#615A73]"
                    }`}
                  >
                    <Plus className="size-4" />
                    开始新对话
                  </button>
                );
              }

              const group = groupLabel(item.session.updatedAt, now);
              const showGroup = group !== lastGroup;
              lastGroup = group;
              const selected = index === activeIndex;
              const isCurrent = item.session.id === currentId;
              return (
                <div key={item.session.id}>
                  {showGroup ? (
                    <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-[#8A8298]">{group}</p>
                  ) : null}
                  <div
                    id={`studio-search-option-${index}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`group flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 ${
                      selected ? "bg-[#f3efe8]" : ""
                    }`}
                  >
                    {editingId === item.session.id ? (
                      <input
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        onBlur={() => void saveEdit()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveEdit();
                          }
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-md border border-[#d8d2c8] bg-white px-2 py-1 text-sm outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => go(item)}
                        className="min-w-0 flex-1 truncate text-left text-sm text-[#241E36]"
                      >
                        {item.session.title || "未命名对话"}
                      </button>
                    )}
                    {isCurrent ? (
                      <span className="shrink-0 rounded-full border border-[#d8d2c8] px-1.5 text-[10px] text-[#8A8298]">
                        当前
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] text-[#8A8298]">
                        {relativeTime(item.session.updatedAt, now)}
                      </span>
                    )}
                    <span className={`shrink-0 items-center gap-0.5 ${selected ? "flex" : "hidden group-hover:flex"}`}>
                      <button type="button" className="rounded-md p-1 text-[#615A73] hover:bg-white" aria-label="打开" onClick={() => go(item)}>
                        <ExternalLink className="size-3.5" />
                      </button>
                      <button type="button" className="rounded-md p-1 text-[#615A73] hover:bg-white" aria-label="重命名" onClick={() => startEdit(item.session)}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" className="rounded-md p-1 text-[#615A73] hover:bg-white" aria-label="删除" onClick={() => void remove(item.session)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5">
          {!active || active.kind === "action" ? (
            <div>
              <h2 className="text-base font-semibold text-[#241E36]">开始新对话</h2>
              <p className="mt-2 text-sm leading-6 text-[#8A8298]">打开工作台，描述你想完成的事。</p>
            </div>
          ) : previewLoading ? (
            <p className="flex items-center gap-1.5 text-sm text-[#8A8298]">
              <LoaderCircle className="size-4 animate-spin" />
              正在加载预览…
            </p>
          ) : !preview || preview.length === 0 ? (
            <div>
              <h2 className="text-base font-semibold text-[#241E36]">{active.session.title || "未命名对话"}</h2>
              <p className="mt-2 text-sm text-[#8A8298]">这条对话还没有可预览的聊天内容。</p>
            </div>
          ) : (
            <div className="flex min-h-full flex-col">
              <h2 className="mb-4 shrink-0 text-sm font-semibold text-[#241E36]">{active.session.title || "未命名对话"}</h2>
              <ol className="flex flex-col gap-3">
                {preview.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <li key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-[18px] px-3.5 py-2.5 text-sm leading-6 ${
                          isUser ? "studio-user-bubble" : "studio-assistant-bubble"
                        }`}
                      >
                        {previewText(message) || "（无文本）"}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-4 border-t border-[#ece7df] px-4 py-2.5 text-[11px] text-[#8A8298]">
        <span>打开 <kbd className="rounded border border-[#e4dfd6] bg-white px-1">Enter</kbd></span>
        <span>重命名 <kbd className="rounded border border-[#e4dfd6] bg-white px-1">Ctrl+E</kbd></span>
        <span>删除 <kbd className="rounded border border-[#e4dfd6] bg-white px-1">Ctrl+D</kbd></span>
      </div>
    </form>
  );
}
