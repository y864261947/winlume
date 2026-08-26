"use client";

import Link from "next/link";
import Image from "next/image";
import { FolderKanban, Image as ImageIcon } from "lucide-react";
import { site } from "@/data/site";
import {
  STUDIO_MODE_ITEMS,
  type StudioModeId,
} from "@/lib/studio/studio-mode";

const ICONS = {
  draw: ImageIcon,
  artifacts: FolderKanban,
} as const;

export default function StudioModeRail({
  mode,
}: {
  mode: StudioModeId;
}) {
  return (
    <nav
      className="studio-mode-rail relative z-[3] flex h-full w-[72px] shrink-0 flex-col items-center border-r py-3"
      aria-label="Studio 模式"
    >
      <div className="flex w-full flex-col items-center gap-1 px-2">
        {STUDIO_MODE_ITEMS.map((item) => {
          const active = mode === item.id;
          const Icon = item.id === "draw" || item.id === "artifacts" ? ICONS[item.id] : null;
          return (
            <span key={item.id} className="flex w-full flex-col items-center">
              <Link
                href={item.href}
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                aria-label={item.id === "workbench" ? `${site.name} 工作台` : item.label}
                className="studio-mode-item flex w-full flex-col items-center gap-1 rounded-[12px] px-1 py-2 text-center"
              >
                {item.id === "workbench" ? (
                  <Image
                    src="/brand/reizo-mark.png"
                    alt=""
                    width={22}
                    height={22}
                    priority
                    className="studio-mode-workbench-mark"
                  />
                ) : Icon ? (
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                ) : null}
                <span>{item.label}</span>
              </Link>
              {item.dividerAfter ? (
                <span className="studio-mode-divider" aria-hidden />
              ) : null}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
