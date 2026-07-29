"use client";

import type { Ref } from "react";
import { ImageIcon, PanelsTopLeft } from "lucide-react";
import {
  filterMentionCandidates,
  type MentionCandidate,
} from "@/lib/studio/image-mentions";

export type { MentionCandidate };
export { filterMentionCandidates };

/**
 * Detects a trailing `@token` at the cursor, mirroring Composer.tsx's
 * `detectSlash` for the skill slash-menu. Returns null once whitespace
 * follows the `@`, so an in-progress mention closes the menu as soon as
 * the user finishes typing past it.
 */
export function detectAtMention(
  text: string,
  cursor: number,
): { start: number; end: number; query: string } | null {
  const upto = text.slice(0, cursor);
  // Industry-common: only after start / whitespace (avoids email mid-token triggers).
  const match = upto.match(/(?:^|[\s\n])@([^\s@]*)$/);
  if (!match) return null;
  const token = match[0];
  const atLocal = token.lastIndexOf("@");
  const start = cursor - token.length + atLocal;
  const query = match[1] ?? "";
  return { start, end: cursor, query };
}

export type ArtifactMentionMenuProps = {
  open: boolean;
  query: string;
  candidates: MentionCandidate[];
  highlightIndex: number;
  onHighlightIndexChange: (index: number) => void;
  onPick: (candidate: MentionCandidate) => void;
  onRetryUpload?: (candidate: MentionCandidate) => void;
  menuId?: string;
  menuRef?: Ref<HTMLDivElement>;
};

export default function ArtifactMentionMenu({
  open,
  query,
  candidates,
  highlightIndex,
  onHighlightIndexChange,
  onPick,
  onRetryUpload,
  menuId,
  menuRef,
}: ArtifactMentionMenuProps) {
  if (!open) return null;
  const items = filterMentionCandidates(candidates, query);

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="listbox"
      className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-72 overflow-y-auto rounded-[14px] border border-white/70 bg-white/95 p-1.5 shadow-lg backdrop-blur"
    >
      {items.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-xs text-[#8A8298]">
          {candidates.length === 0
            ? "先添加图片或画布，再输入 @ 引用"
            : "没有匹配的作品"}
        </p>
      ) : (
        items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={index === highlightIndex}
            onMouseEnter={() => onHighlightIndexChange(index)}
            onClick={() =>
              item.status === "failed" && onRetryUpload
                ? onRetryUpload(item)
                : onPick(item)
            }
            className={`flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs transition ${
              index === highlightIndex
                ? "bg-[rgba(15,23,42,0.06)] text-[#0F172A]"
                : "text-[#241E36] hover:bg-[rgba(15,23,42,0.04)]"
            }`}
          >
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-[8px] border border-white/80 bg-white/70">
              {item.status === "failed" ? (
                <span className="flex h-full w-full items-center justify-center text-rose-500">
                  <ImageIcon className="h-3.5 w-3.5" />
                </span>
              ) : item.kind === "canvas" ? (
                <span className="flex h-full w-full items-center justify-center bg-primary-50 text-primary-600">
                  <PanelsTopLeft className="h-3.5 w-3.5" />
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL or user-scoped raw route
                <img
                  src={item.thumbSrc}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">@{item.name}</span>
              {item.source === "local" && !item.artifactId ? (
                <span className="ml-1 text-[10px] text-[#8A8298]">
                  {item.status === "failed" ? "上传失败，点击重试" : "本地"}
                </span>
              ) : null}
              {item.kind === "canvas" ? (
                <span className="ml-1 text-[10px] text-[#8A8298]">画布</span>
              ) : null}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
