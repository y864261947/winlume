"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Monitor,
  MoreHorizontal,
  RefreshCw,
  Smartphone,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Artifact, ArtifactKind } from "@/lib/agent/types";
import {
  canExportAsDocument,
  exportArtifactAsPdf,
  exportArtifactAsWord,
} from "@/lib/studio/artifact-export";

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  binary: "二进制",
};

type ViewMode = "preview" | "source";
type HtmlFrame = "desktop" | "mobile";

const MOBILE_FRAME_WIDTH = 390;

/** Toolbar action keys — overflow calc like NewMax getMarkdownToolbarOverflowActions */
type ActionKey =
  | "copy"
  | "download"
  | "open"
  | "export"
  | "refresh"
  | "maximize"
  | "jump";

const ACTION_MIN_WIDTH: Record<ActionKey, number> = {
  copy: 64,
  download: 64,
  open: 56,
  export: 64,
  refresh: 36,
  maximize: 36,
  jump: 72,
};

export type ArtifactPreviewProps = {
  artifact: Artifact | null;
  content: string | null;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  onRefresh?: () => void;
  /** Jump to the chat message that produced this artifact. */
  onJumpToMessage?: (messageId: string) => void;
  className?: string;
};

function extensionFor(kind: ArtifactKind, name: string): string {
  const lower = name.toLowerCase();
  if (/\.[a-z0-9]{1,8}$/i.test(lower)) return "";
  switch (kind) {
    case "markdown":
      return ".md";
    case "html":
      return ".html";
    case "json":
      return ".json";
    case "image":
      return "";
    default:
      return ".txt";
  }
}

function mimeFor(kind: ArtifactKind): string {
  switch (kind) {
    case "markdown":
      return "text/markdown;charset=utf-8";
    case "html":
      return "text/html;charset=utf-8";
    case "json":
      return "application/json;charset=utf-8";
    default:
      return "text/plain;charset=utf-8";
  }
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="artifact-md px-4 py-3 text-sm leading-6 text-ink-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 text-xl font-bold text-ink-950 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold text-ink-950 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-semibold text-ink-900 first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-6">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary-600 underline decoration-primary-200 underline-offset-2 hover:text-primary-700"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-lg bg-ink-950 p-3 font-mono text-[12px] leading-5 text-ink-100">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[12px] text-primary-700">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-xl bg-ink-950 p-0 last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-primary-300 pl-3 text-ink-600 italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-line bg-canvas px-2 py-1.5 font-semibold text-ink-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-line px-2 py-1.5 text-ink-700">{children}</td>
          ),
          hr: () => <hr className="my-4 border-line" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function HtmlBody({
  content,
  frame,
}: {
  content: string;
  frame: HtmlFrame;
}) {
  const mobile = frame === "mobile";
  return (
    <div
      className={`flex min-h-0 flex-1 justify-center overflow-auto ${
        mobile ? "bg-[#E8E4DC] p-3" : ""
      }`}
    >
      <iframe
        title="作品预览"
        sandbox="allow-scripts allow-same-origin"
        srcDoc={content}
        className={`border-0 bg-white ${
          mobile
            ? "h-full min-h-[28rem] w-full max-w-[390px] rounded-[20px] shadow-lg ring-1 ring-black/10"
            : "h-full min-h-[16rem] w-full flex-1"
        }`}
        style={mobile ? { width: MOBILE_FRAME_WIDTH } : undefined}
      />
    </div>
  );
}

function TextBody({ content, kind }: { content: string; kind: ArtifactKind }) {
  let display = content;
  if (kind === "json") {
    try {
      display = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      /* keep raw */
    }
  }
  return (
    <pre className="max-h-full overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-5 text-ink-700">
      {display}
    </pre>
  );
}

function renderPreview(
  artifact: Artifact,
  content: string,
  htmlFrame: HtmlFrame,
): ReactNode {
  switch (artifact.kind) {
    case "markdown":
      return <MarkdownBody content={content} />;
    case "html":
      return <HtmlBody content={content} frame={htmlFrame} />;
    case "image":
      return (
        <p className="px-4 py-6 text-sm text-ink-500">
          图片作品暂不支持内联预览。
        </p>
      );
    case "binary":
      return (
        <p className="px-4 py-6 text-sm text-ink-500">
          二进制作品无法在此预览。
        </p>
      );
    case "json":
    case "text":
    default:
      return <TextBody content={content} kind={artifact.kind} />;
  }
}

function ToolbarBtn({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 items-center gap-1 rounded-[8px] px-1.5 text-[11px] text-[#615A73] transition hover:bg-white/70 hover:text-[#241E36] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function MenuItem({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs text-[#241E36] transition hover:bg-[rgba(194,65,12,0.08)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function ArtifactPreview({
  artifact,
  content,
  loading = false,
  error = null,
  onClose,
  onRefresh,
  onJumpToMessage,
  className = "",
}: ArtifactPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [htmlFrame, setHtmlFrame] = useState<HtmlFrame>("desktop");
  const [copied, setCopied] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [overflowKeys, setOverflowKeys] = useState<ActionKey[]>([]);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTabRef = useRef<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewMode("preview");
    setHtmlFrame("desktop");
    setCopied(false);
    setExportOpen(false);
    setMoreOpen(false);
    setExportError(null);
  }, [artifact?.id]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (openTabRef.current) {
        URL.revokeObjectURL(openTabRef.current);
        openTabRef.current = null;
      }
    };
  }, []);

  // Esc exits maximize
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  // Close menus on outside click
  useEffect(() => {
    if (!exportOpen && !moreOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (exportOpen && !exportMenuRef.current?.contains(t)) {
        setExportOpen(false);
      }
      if (moreOpen && !moreMenuRef.current?.contains(t)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen, moreOpen]);

  const canShowSource = Boolean(
    artifact &&
      content != null &&
      artifact.kind !== "binary" &&
      artifact.kind !== "image",
  );

  const hasPreview = Boolean(
    artifact &&
      content != null &&
      (artifact.kind === "markdown" ||
        artifact.kind === "html" ||
        artifact.kind === "json" ||
        artifact.kind === "text"),
  );

  const sourceText = useMemo(() => {
    if (content == null) return "";
    if (artifact?.kind === "json") {
      try {
        return JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        return content;
      }
    }
    return content;
  }, [artifact?.kind, content]);

  const isHtml = artifact?.kind === "html";
  const canExport = Boolean(
    artifact && content != null && canExportAsDocument(artifact.kind),
  );
  const canJump = Boolean(artifact?.messageId && onJumpToMessage);
  const availableKeys = useMemo((): ActionKey[] => {
    const keys: ActionKey[] = ["copy", "download"];
    if (isHtml) keys.push("open");
    if (canExport) keys.push("export");
    if (onRefresh) keys.push("refresh");
    keys.push("maximize");
    if (canJump) keys.push("jump");
    return keys;
  }, [isHtml, canExport, onRefresh, canJump]);

  // NewMax-style overflow: measure action rail, push trailing actions into More
  useEffect(() => {
    const el = actionsRef.current;
    if (!el) return;
    const calc = () => {
      const available = el.clientWidth;
      // Reserve slot for the More button itself
      const moreW = 36;
      let used = moreW;
      const overflow: ActionKey[] = [];
      // Keep copy + download preferred in primary when possible
      const priority: ActionKey[] = [...availableKeys];
      for (const key of priority) {
        const w = ACTION_MIN_WIDTH[key];
        if (used + w <= available) {
          used += w;
        } else {
          overflow.push(key);
        }
      }
      // If everything fits, no overflow menu needed for primary keys —
      // still allow empty overflow (More hidden when empty of secondary)
      setOverflowKeys((prev) =>
        prev.length === overflow.length &&
        prev.every((k, i) => k === overflow[i])
          ? prev
          : overflow,
      );
    };
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    calc();
    return () => ro.disconnect();
  }, [availableKeys, maximized, artifact?.id]);

  const primaryKeys = useMemo(
    () => availableKeys.filter((k) => !overflowKeys.includes(k)),
    [availableKeys, overflowKeys],
  );

  const handleCopy = useCallback(async () => {
    if (!sourceText) return;
    try {
      await navigator.clipboard.writeText(sourceText);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* denied */
    }
  }, [sourceText]);

  const handleDownload = useCallback(() => {
    if (!artifact || content == null) return;
    const ext = extensionFor(artifact.kind, artifact.name);
    const filename = `${artifact.name}${ext}`;
    const blob = new Blob([content], { type: mimeFor(artifact.kind) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact, content]);

  const handleOpenHtml = useCallback(() => {
    if (!artifact || artifact.kind !== "html" || content == null) return;
    if (openTabRef.current) URL.revokeObjectURL(openTabRef.current);
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    openTabRef.current = url;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [artifact, content]);

  const handleExportPdf = useCallback(() => {
    if (!artifact || content == null) return;
    setExportError(null);
    try {
      exportArtifactAsPdf({
        title: artifact.name,
        kind: artifact.kind,
        content,
      });
      setExportOpen(false);
      setMoreOpen(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "导出 PDF 失败");
    }
  }, [artifact, content]);

  const handleExportWord = useCallback(() => {
    if (!artifact || content == null) return;
    setExportError(null);
    try {
      exportArtifactAsWord({
        title: artifact.name,
        kind: artifact.kind,
        content,
        filenameBase: artifact.name,
      });
      setExportOpen(false);
      setMoreOpen(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "导出 Word 失败");
    }
  }, [artifact, content]);

  const handleJump = useCallback(() => {
    if (!artifact?.messageId || !onJumpToMessage) return;
    onJumpToMessage(artifact.messageId);
    setMoreOpen(false);
    if (maximized) setMaximized(false);
  }, [artifact?.messageId, onJumpToMessage, maximized]);

  const showModeToggle = canShowSource && hasPreview;
  const busy = loading || content == null;

  const renderAction = (key: ActionKey, opts?: { inMenu?: boolean }) => {
    const inMenu = opts?.inMenu;
    if (key === "copy") {
      if (inMenu) {
        return (
          <MenuItem
            key={key}
            onClick={() => void handleCopy()}
            disabled={!sourceText || loading}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "已复制" : "复制内容"}
          </MenuItem>
        );
      }
      return (
        <ToolbarBtn
          key={key}
          onClick={() => void handleCopy()}
          title="复制内容"
          disabled={!sourceText || loading}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {copied ? "已复制" : "复制"}
          </span>
        </ToolbarBtn>
      );
    }
    if (key === "download") {
      if (inMenu) {
        return (
          <MenuItem key={key} onClick={handleDownload} disabled={busy}>
            <Download className="h-3.5 w-3.5" />
            下载原文件
          </MenuItem>
        );
      }
      return (
        <ToolbarBtn
          key={key}
          onClick={handleDownload}
          title="下载文件"
          disabled={busy}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">下载</span>
        </ToolbarBtn>
      );
    }
    if (key === "open") {
      if (inMenu) {
        return (
          <MenuItem key={key} onClick={handleOpenHtml} disabled={busy}>
            <ExternalLink className="h-3.5 w-3.5" />
            新标签打开
          </MenuItem>
        );
      }
      return (
        <ToolbarBtn
          key={key}
          onClick={handleOpenHtml}
          title="在新标签打开"
          disabled={busy}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">打开</span>
        </ToolbarBtn>
      );
    }
    if (key === "export") {
      if (inMenu) {
        return (
          <div key={key} className="border-t border-line/60 py-1">
            <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[#8A8298]">
              导出
            </p>
            <MenuItem onClick={handleExportPdf} disabled={busy}>
              <FileText className="h-3.5 w-3.5" />
              导出 PDF…
            </MenuItem>
            <MenuItem onClick={handleExportWord} disabled={busy}>
              <FileText className="h-3.5 w-3.5" />
              导出 Word (.doc)
            </MenuItem>
          </div>
        );
      }
      return (
        <div key={key} className="relative" ref={exportMenuRef}>
          <ToolbarBtn
            onClick={() => {
              setExportOpen((v) => !v);
              setMoreOpen(false);
            }}
            title="导出"
            disabled={busy}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">导出</span>
          </ToolbarBtn>
          {exportOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-[12px] border border-white/80 bg-white/95 p-1 shadow-lg backdrop-blur"
            >
              <MenuItem onClick={handleExportPdf} disabled={busy}>
                导出 PDF…
              </MenuItem>
              <MenuItem onClick={handleExportWord} disabled={busy}>
                导出 Word (.doc)
              </MenuItem>
            </div>
          ) : null}
        </div>
      );
    }
    if (key === "refresh") {
      if (inMenu) {
        return (
          <MenuItem
            key={key}
            onClick={() => {
              onRefresh?.();
              setMoreOpen(false);
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新内容
          </MenuItem>
        );
      }
      return (
        <ToolbarBtn
          key={key}
          onClick={onRefresh}
          title="刷新内容"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </ToolbarBtn>
      );
    }
    if (key === "maximize") {
      if (inMenu) {
        return (
          <MenuItem
            key={key}
            onClick={() => {
              setMaximized((v) => !v);
              setMoreOpen(false);
            }}
          >
            {maximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            {maximized ? "退出全屏" : "最大化预览"}
          </MenuItem>
        );
      }
      return (
        <ToolbarBtn
          key={key}
          onClick={() => setMaximized((v) => !v)}
          title={maximized ? "退出全屏" : "最大化预览"}
        >
          {maximized ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </ToolbarBtn>
      );
    }
    if (key === "jump") {
      if (inMenu) {
        return (
          <MenuItem key={key} onClick={handleJump}>
            <MessageSquareText className="h-3.5 w-3.5" />
            跳到对话
          </MenuItem>
        );
      }
      return (
        <ToolbarBtn key={key} onClick={handleJump} title="跳到产生该作品的消息">
          <MessageSquareText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">对话</span>
        </ToolbarBtn>
      );
    }
    return null;
  };

  const body = (
    <>
      {/* Title row */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          {artifact ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest text-ink-400">
                {KIND_LABELS[artifact.kind] ?? artifact.kind}
              </p>
              <h2 className="mt-0.5 truncate text-sm font-semibold text-ink-900">
                {artifact.name}
              </h2>
            </>
          ) : (
            <h2 className="text-sm font-semibold text-ink-700">作品预览</h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {maximized ? (
            <button
              type="button"
              onClick={() => setMaximized(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-canvas hover:text-ink-800"
              title="退出全屏 (Esc)"
            >
              <Minimize2 className="h-4 w-4" />
              <span className="sr-only">退出全屏</span>
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (maximized) setMaximized(false);
                onClose();
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-ink-500 transition hover:bg-canvas hover:text-[#C2410C]"
              title="关闭预览"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">关闭预览</span>
            </button>
          ) : null}
        </div>
      </div>

      {artifact ? (
        <div
          ref={toolbarRef}
          className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-line/80 bg-canvas/40 px-2 py-1"
        >
          {showModeToggle ? (
            <div className="mr-1 flex rounded-[8px] border border-white/70 bg-white/50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-medium transition ${
                  viewMode === "preview"
                    ? "bg-white text-[#C2410C] shadow-sm"
                    : "text-[#8A8298] hover:text-[#241E36]"
                }`}
              >
                <Eye className="h-3 w-3" />
                预览
              </button>
              <button
                type="button"
                onClick={() => setViewMode("source")}
                className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-medium transition ${
                  viewMode === "source"
                    ? "bg-white text-[#C2410C] shadow-sm"
                    : "text-[#8A8298] hover:text-[#241E36]"
                }`}
              >
                <Code2 className="h-3 w-3" />
                源码
              </button>
            </div>
          ) : null}

          {isHtml && viewMode === "preview" ? (
            <div className="mr-1 flex rounded-[8px] border border-white/70 bg-white/50 p-0.5">
              <button
                type="button"
                onClick={() => setHtmlFrame("desktop")}
                title="桌面宽度"
                className={`inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] transition ${
                  htmlFrame === "desktop"
                    ? "bg-white text-[#C2410C] shadow-sm"
                    : "text-[#8A8298] hover:text-[#241E36]"
                }`}
              >
                <Monitor className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setHtmlFrame("mobile")}
                title="手机宽度 390px"
                className={`inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] transition ${
                  htmlFrame === "mobile"
                    ? "bg-white text-[#C2410C] shadow-sm"
                    : "text-[#8A8298] hover:text-[#241E36]"
                }`}
              >
                <Smartphone className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          <div
            ref={actionsRef}
            className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-0.5"
          >
            {primaryKeys.map((k) => renderAction(k))}
            {overflowKeys.length > 0 ? (
              <div className="relative" ref={moreMenuRef}>
                <ToolbarBtn
                  onClick={() => {
                    setMoreOpen((v) => !v);
                    setExportOpen(false);
                  }}
                  title="更多"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">更多</span>
                </ToolbarBtn>
                {moreOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-20 mt-1 min-w-[11.5rem] rounded-[12px] border border-white/80 bg-white/95 p-1 shadow-lg backdrop-blur"
                  >
                    {overflowKeys.map((k) => renderAction(k, { inMenu: true }))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {exportError ? (
        <div className="shrink-0 border-b border-[rgba(239,71,112,0.2)] bg-[rgba(239,71,112,0.06)] px-3 py-1.5 text-[11px] text-[#C2410C]">
          {exportError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-ink-500">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            读取内容…
          </div>
        ) : error ? (
          <p className="px-4 py-6 text-sm text-rose-600">{error}</p>
        ) : !artifact ? (
          <p className="px-4 py-8 text-center text-sm text-ink-400">
            选择左侧作品查看预览
          </p>
        ) : content == null ? (
          <p className="px-4 py-6 text-sm text-ink-400">无法读取内容</p>
        ) : viewMode === "source" && canShowSource ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TextBody content={sourceText} kind={artifact.kind} />
          </div>
        ) : artifact.kind === "html" ? (
          renderPreview(artifact, content, htmlFrame)
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {renderPreview(artifact, content, htmlFrame)}
          </div>
        )}
      </div>
    </>
  );

  if (maximized) {
    return (
      <>
        {/* Keep layout slot so resize doesn't jump when maximized from side pane */}
        <aside
          className={`flex min-h-0 flex-col border-l border-line bg-surface ${className}`}
          aria-hidden
        >
          <div className="flex flex-1 items-center justify-center text-xs text-ink-400">
            预览已最大化
          </div>
        </aside>
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-[rgba(36,30,54,0.45)] p-2 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="作品全屏预览"
        >
          <div className="studio-glass mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[18px] border border-white/60 bg-[rgba(252,249,244,0.98)] shadow-2xl">
            {body}
          </div>
        </div>
      </>
    );
  }

  return (
    <aside
      className={`flex min-h-0 flex-col border-l border-line bg-surface ${className}`}
    >
      {body}
    </aside>
  );
}
