"use client";

import type { ReactNode } from "react";
import { LoaderCircle, PanelRightClose, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Artifact, ArtifactKind } from "@/lib/agent/types";

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  binary: "二进制",
};

export type ArtifactPreviewProps = {
  artifact: Artifact | null;
  content: string | null;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  className?: string;
};

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

function HtmlBody({ content }: { content: string }) {
  return (
    <iframe
      title="作品预览"
      sandbox="allow-scripts"
      srcDoc={content}
      className="h-full min-h-[16rem] w-full flex-1 border-0 bg-white"
    />
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

function renderBody(artifact: Artifact, content: string): ReactNode {
  switch (artifact.kind) {
    case "markdown":
      return <MarkdownBody content={content} />;
    case "html":
      return <HtmlBody content={content} />;
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

export default function ArtifactPreview({
  artifact,
  content,
  loading = false,
  error = null,
  onClose,
  className = "",
}: ArtifactPreviewProps) {
  return (
    <aside
      className={`flex min-h-0 flex-col border-l border-line bg-surface ${className}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-3 py-2.5">
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
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-canvas hover:text-ink-800"
            title="关闭预览"
          >
            <PanelRightClose className="hidden h-4 w-4 sm:block" />
            <X className="h-4 w-4 sm:hidden" />
            <span className="sr-only">关闭预览</span>
          </button>
        ) : null}
      </div>

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
        ) : artifact.kind === "html" ? (
          renderBody(artifact, content)
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {renderBody(artifact, content)}
          </div>
        )}
      </div>
    </aside>
  );
}
