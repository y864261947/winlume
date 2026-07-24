"use client";

import { Pin, PinOff, X } from "lucide-react";
import type { SkillMeta } from "@/lib/agent/types";

export type SkillChipsProps = {
  turnIds: string[];
  pinnedIds: string[];
  skillsById: Map<string, SkillMeta>;
  onRemoveTurn: (id: string) => void;
  onTogglePin: (id: string) => void;
  onClearTurn?: () => void;
  disabled?: boolean;
};

function resolveMeta(
  id: string,
  skillsById: Map<string, SkillMeta>,
): Pick<SkillMeta, "id" | "name"> {
  const meta = skillsById.get(id);
  return { id, name: meta?.name || id };
}

export default function SkillChips({
  turnIds,
  pinnedIds,
  skillsById,
  onRemoveTurn,
  onTogglePin,
  onClearTurn,
  disabled = false,
}: SkillChipsProps) {
  const hasPinned = pinnedIds.length > 0;
  const hasTurn = turnIds.length > 0;
  if (!hasPinned && !hasTurn) return null;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      {hasPinned ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[#8A8298]">
            钉住
          </span>
          {pinnedIds.map((id) => {
            const s = resolveMeta(id, skillsById);
            return (
              <span
                key={`pin-${id}`}
                className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-[rgba(99,102,241,0.25)] bg-[rgba(99,102,241,0.08)] py-0.5 pl-2.5 pr-1 text-xs text-[#4F46E5]"
              >
                <Pin className="h-3 w-3 shrink-0 fill-current opacity-80" />
                <span className="truncate">{s.name}</span>
                <button
                  type="button"
                  onClick={() => onTogglePin(id)}
                  disabled={disabled}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#4F46E5] hover:bg-[rgba(99,102,241,0.14)] disabled:opacity-50"
                  title="取消钉住"
                >
                  <PinOff className="h-3 w-3" />
                  <span className="sr-only">取消钉住 {s.name}</span>
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {hasTurn ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[#8A8298]">
            本轮
          </span>
          {turnIds.map((id) => {
            const s = resolveMeta(id, skillsById);
            const pinned = pinnedIds.includes(id);
            return (
              <span
                key={`turn-${id}`}
                className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-[rgba(194,65,12,0.2)] bg-[rgba(194,65,12,0.08)] py-0.5 pl-2.5 pr-1 text-xs text-[#C2410C]"
              >
                <span className="truncate">{s.name}</span>
                <button
                  type="button"
                  onClick={() => onTogglePin(id)}
                  disabled={disabled}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#C2410C] hover:bg-[rgba(194,65,12,0.12)] disabled:opacity-50"
                  title={pinned ? "取消钉住" : "钉住到会话"}
                >
                  {pinned ? (
                    <Pin className="h-3 w-3 fill-current" />
                  ) : (
                    <Pin className="h-3 w-3" />
                  )}
                  <span className="sr-only">
                    {pinned ? "取消钉住" : "钉住"} {s.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveTurn(id)}
                  disabled={disabled}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#C2410C] hover:bg-[rgba(194,65,12,0.12)] disabled:opacity-50"
                  title="移除本轮"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">移除 {s.name}</span>
                </button>
              </span>
            );
          })}
          {onClearTurn && turnIds.length > 1 ? (
            <button
              type="button"
              onClick={onClearTurn}
              disabled={disabled}
              className="text-[11px] text-[#8A8298] underline-offset-2 hover:text-[#C2410C] hover:underline disabled:opacity-50"
            >
              清空本轮
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
