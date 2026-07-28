"use client";

import type { Ref } from "react";
import { ImageIcon } from "lucide-react";
import type { Artifact } from "@/lib/agent/types";

const MENTION_MAX = 20;

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
  const match = upto.match(/(?:^|[\s\n])@([^\s@]*)$/);
  if (!match) return null;
  const token = match[0];
  const atLocal = token.lastIndexOf("@");
  const start = cursor - token.length + atLocal;
  const query = match[1] ?? "";
  return { start, end: cursor, query };
}

export function filterMentionArtifacts(
  artifacts: Artifact[],
  query: string,
): Artifact[] {
  const q = query.trim().toLowerCase();
  const pool = q
    ? artifacts.filter((a) => a.name.toLowerCase().includes(q))
    : artifacts;
  return pool.slice(0, MENTION_MAX);
}

export type ArtifactMentionMenuProps = {
  open: boolean;
  query: string;
  artifacts: Artifact[];
  highlightIndex: number;
  onHighlightIndexChange: (index: number) => void;
  onPick: (artifact: Artifact) => void;
  menuId?: string;
  menuRef?: Ref<HTMLDivElement>;
};

export default function ArtifactMentionMenu({
  open,
  query,
  artifacts,
  highlightIndex,
  onHighlightIndexChange,
  onPick,
  menuId,
  menuRef,
}: ArtifactMentionMenuProps) {
  if (!open) return null;
  const items = filterMentionArtifacts(artifacts, query);

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="listbox"
      className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-72 overflow-y-auto rounded-[14px] border border-white/70 bg-white/95 p-1.5 shadow-lg backdrop-blur"
    >
      {items.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-xs text-[#8A8298]">
          {artifacts.length === 0 ? "还没有可引用的图片作品" : "没有匹配的作品"}
        </p>
      ) : (
        items.map((artifact, index) => (
          <button
            key={artifact.id}
            type="button"
            role="option"
            aria-selected={index === highlightIndex}
            onMouseEnter={() => onHighlightIndexChange(index)}
            onClick={() => onPick(artifact)}
            className={`flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs transition ${
              index === highlightIndex
                ? "bg-[rgba(15,23,42,0.06)] text-[#0F172A]"
                : "text-[#241E36] hover:bg-[rgba(15,23,42,0.04)]"
            }`}
          >
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-[8px] border border-white/80 bg-white/70">
              {artifact.status === "ready" || !artifact.status ? (
                // eslint-disable-next-line @next/next/no-img-element -- small thumbnail from a user-scoped artifact route
                <img
                  src={`/api/artifacts/${artifact.id}/raw`}
                  alt={artifact.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[#8A8298]">
                  <ImageIcon className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{artifact.name}</span>
          </button>
        ))
      )}
    </div>
  );
}
