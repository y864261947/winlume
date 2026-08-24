"use client";

import Link from "next/link";
import Image from "next/image";
import { FolderKanban, Image as ImageIcon, LayoutGrid, Sparkles } from "lucide-react";
import { site } from "@/data/site";
import {
  STUDIO_MODE_ITEMS,
  type StudioModeId,
} from "@/lib/studio/studio-mode";
import StudioAccountControl from "./StudioAccountControl";

const ICONS = {
  workbench: Sparkles,
  draw: ImageIcon,
  tools: LayoutGrid,
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
      <Link
        href="/studio"
        className="studio-mode-mark mb-4 inline-flex size-9 items-center justify-center rounded-[10px]"
        title={site.name}
        aria-label={site.name}
      >
        <Image src="/brand/reizo-mark.png" alt="" width={22} height={22} priority />
      </Link>
      <div className="flex w-full flex-col items-center gap-1 px-2">
        {STUDIO_MODE_ITEMS.map((item) => {
          const Icon = ICONS[item.id];
          const active = mode === item.id;
          return (
            <span key={item.id} className="flex w-full flex-col items-center">
              <Link
                href={item.href}
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                className="studio-mode-item flex w-full flex-col items-center gap-1 rounded-[12px] px-1 py-2 text-center"
              >
                <Icon className="size-[18px]" strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
              {item.dividerAfter ? (
                <span className="studio-mode-divider" aria-hidden />
              ) : null}
            </span>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col items-center pt-2">
        <span className="studio-mode-divider mb-3" aria-hidden />
        <StudioAccountControl />
      </div>
    </nav>
  );
}
