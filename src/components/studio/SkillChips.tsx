"use client";

import { useEffect, useState } from "react";
import type { SkillMeta } from "@/lib/agent/types";
import { skillMonogram } from "@/lib/studio/skill-mark";

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
): Pick<SkillMeta, "id" | "name" | "iconUrl"> {
  const meta = skillsById.get(id);
  return { id, name: meta?.name || id, iconUrl: meta?.iconUrl };
}

export function SkillChipMark({ name, iconUrl }: { name: string; iconUrl?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [iconUrl]);
  const showImage = Boolean(iconUrl) && !broken;
  return (
    <span className="studio-skill-chip-mark" aria-hidden>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- mixed SkillHub CDNs
        <img
          src={iconUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        skillMonogram(name)
      )}
    </span>
  );
}

export default function SkillChips({
  turnIds,
  pinnedIds,
  skillsById,
  onRemoveTurn,
  onTogglePin,
  disabled = false,
}: SkillChipsProps) {
  const ids = [
    ...pinnedIds,
    ...turnIds.filter((id) => !pinnedIds.includes(id)),
  ];
  if (ids.length === 0) return null;

  function dismiss(id: string) {
    onRemoveTurn(id);
    if (pinnedIds.includes(id)) onTogglePin(id);
  }

  return (
    <div className="studio-skill-chip-row" aria-label="已挂载技能">
      {ids.map((id) => {
        const skill = resolveMeta(id, skillsById);
        return (
          <button
            key={id}
            type="button"
            className="studio-skill-chip"
            disabled={disabled}
            title={`移除 ${skill.name}`}
            onClick={() => dismiss(id)}
          >
            <SkillChipMark name={skill.name} iconUrl={skill.iconUrl} />
            <span className="studio-skill-chip-name">{skill.name}</span>
          </button>
        );
      })}
    </div>
  );
}
