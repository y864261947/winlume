"use client";

import Link from "next/link";
import {
  Copy,
  Droplet,
  Layers,
  Maximize2,
  Scissors,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { DRAW_FAMILY_ITEMS } from "@/lib/studio/studio-mode";

const ICONS: Record<string, typeof ShoppingBag> = {
  "ecommerce-image-set": ShoppingBag,
  "background-removal": Scissors,
  "image-clarity": Sparkles,
  "watermark-subtitle-removal": Droplet,
  "image-fusion": Layers,
  "hot-image": Copy,
  "expand-image": Maximize2,
};

export default function DrawToolFamily({
  activeId,
}: {
  activeId: string;
}) {
  return (
    <nav
      className="studio-draw-family flex h-full w-[76px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r py-3"
      aria-label="做图工具"
    >
      {DRAW_FAMILY_ITEMS.map((item, index) => {
        const Icon = ICONS[item.id] ?? Sparkles;
        const active = item.id === activeId;
        const className =
          "studio-draw-family-item flex w-[56px] flex-col items-center gap-1 rounded-[12px] px-1 py-2 text-center";
        const divider =
          item.soon && !DRAW_FAMILY_ITEMS[index - 1]?.soon ? (
            <span key={`${item.id}-divider`} className="studio-draw-family-divider my-1 block h-px w-8" aria-hidden />
          ) : null;

        if (item.soon || !item.href) {
          return (
            <span key={item.id} className="contents">
              {divider}
              <span className={className} data-soon="true" title="接入中">
                <Icon className="size-4" strokeWidth={1.8} />
                <span>{item.label}</span>
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            <Icon className="size-4" strokeWidth={1.8} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
