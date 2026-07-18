"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { FaqItem } from "@/data/site";

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((item, i) => {
        const open = openIndex === i;
        const buttonId = `${baseId}-q-${i}`;
        const panelId = `${baseId}-a-${i}`;
        return (
          <div key={item.question}>
            <button
              type="button"
              id={buttonId}
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-canvas"
            >
              <span className={`text-sm font-medium ${open ? "text-ink-900" : "text-ink-600"}`}>
                {item.question}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition ${
                  open ? "rotate-180 text-primary-500" : "text-ink-400"
                }`}
              />
            </button>
            {/* grid-rows 过渡实现展开/收起动画，且尊重全局 reduced-motion 设置 */}
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-6 text-ink-500">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
