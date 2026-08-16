"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";

export type ComparePreviewBackground = "checker" | "white" | "black";

const PREVIEW_BACKGROUNDS: Record<ComparePreviewBackground, string> = {
  checker:
    "repeating-conic-gradient(#e8eaed 0% 25%, #fff 0% 50%)",
  white: "#ffffff",
  black: "#111111",
};

export function ImageCompareSlider({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  previewBackground = "checker",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
  previewBackground?: ComparePreviewBackground;
}) {
  const [percent, setPercent] = useState(52);
  const frameRef = useRef<HTMLDivElement>(null);

  const moveTo = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) return;
    setPercent(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };

  return (
    <div className="w-full">
      <div
        ref={frameRef}
        role="slider"
        aria-label="拖动对比原图和抠图结果"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          moveTo(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setPercent((value) => Math.max(0, value - 4));
          if (event.key === "ArrowRight") setPercent((value) => Math.min(100, value + 4));
        }}
        className="relative aspect-square cursor-ew-resize overflow-hidden rounded-lg border border-line shadow-sm select-none"
        style={{
          background: PREVIEW_BACKGROUNDS[previewBackground],
          backgroundSize: previewBackground === "checker" ? "20px 20px" : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- cookie-auth artifact bytes */}
        <img src={beforeSrc} alt={beforeAlt} className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- cookie-auth artifact bytes */}
          <img src={afterSrc} alt={afterAlt} className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        </div>
        <div
          className="absolute inset-y-0 z-10 w-px bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.25)]"
          style={{ left: `${percent}%` }}
        >
          <span className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-[11px] font-medium text-ink-700 shadow-sm">
            ↔
          </span>
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
          结果
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
          原图
        </span>
      </div>
    </div>
  );
}
