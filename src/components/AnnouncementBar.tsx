"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { site } from "@/data/site";

const storageKey = "reizo:announcement-dismissed-v1";

export default function AnnouncementBar() {
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 挂载后再读 localStorage：已关闭过的用户直接移除，避免 hydration 不一致
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem(storageKey)) setVisible(false);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(storageKey, "1");
    setClosing(true);
    // 高度收起动画结束后再移除，避免下方 sticky header 突然上跳
    timerRef.current = setTimeout(() => setVisible(false), 200);
  };

  if (!visible) return null;

  return (
    <div
      className={`relative z-[60] grid border-b border-line bg-surface transition-all duration-200 ${
        closing ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
    >
      <div className="overflow-hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm">
          <span className="spectrum-bg h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
          <Megaphone className="h-3.5 w-3.5 shrink-0 text-primary-500" />
          <Link
            href="/products/app-image-studio"
            className="truncate font-medium text-ink-600 transition hover:text-primary-600"
          >
            {site.announcement}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="关闭公告"
            className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition hover:bg-canvas hover:text-ink-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
