"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PortalImageAdjust } from "@/lib/portal/content-config";

export type PortalPreviewKind = "carousel" | "application" | "capability";

/** Matches the homepage CSS defaults: showcase images are pre-scaled to bleed to the card edge. */
const BASE_SCALE: Record<PortalPreviewKind, number> = {
  carousel: 1,
  application: 1.08,
  capability: 1.04,
};
const DEFAULT_FIT: Record<PortalPreviewKind, "contain" | "cover"> = {
  carousel: "contain",
  application: "cover",
  capability: "cover",
};
const FRAME_STYLE: Record<PortalPreviewKind, CSSProperties> = {
  // 首页轮播卡片约 430×348，米白衬底与幻灯片边缘同色
  carousel: { aspectRatio: "430 / 348", background: "#ebe4d8" },
  // 热门应用大图卡片
  application: { aspectRatio: "16 / 10", background: "#172a55" },
  // 能力模块卡片
  capability: { aspectRatio: "16 / 9", background: "linear-gradient(145deg,#0a1530,#172d56)" },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function frameImageStyle(kind: PortalPreviewKind, adjust: PortalImageAdjust | undefined): CSSProperties {
  const fit = adjust?.fit ?? DEFAULT_FIT[kind];
  const x = adjust?.x ?? 50;
  const y = adjust?.y ?? 50;
  const zoom = adjust?.zoom ?? 1;
  return {
    objectFit: fit,
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${Math.round(BASE_SCALE[kind] * zoom * 1000) / 1000})`,
  };
}

function FrameOverlay({ kind, title, eyebrow }: { kind: PortalPreviewKind; title?: string; eyebrow?: string }) {
  if (kind === "carousel") {
    return (
      <>
        <span className="pointer-events-none absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-600 shadow">
          <ChevronLeft className="h-4 w-4" />
        </span>
        <span className="pointer-events-none absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-600 shadow">
          <ChevronRight className="h-4 w-4" />
        </span>
        <span className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          <i className="h-1.5 w-4 rounded-full bg-white/90" />
          <i className="h-1.5 w-1.5 rounded-full bg-white/50" />
          <i className="h-1.5 w-1.5 rounded-full bg-white/50" />
        </span>
      </>
    );
  }
  return (
    <>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-[rgba(7,15,45,0.82)]" />
      <span className="pointer-events-none absolute inset-x-4 bottom-3 grid gap-0.5">
        {eyebrow ? <em className="text-[10px] font-bold not-italic tracking-widest text-white/70">{eyebrow}</em> : null}
        <strong className="truncate text-sm text-white">{title || "展示标题"}</strong>
      </span>
    </>
  );
}

export default function PortalImageAdjustDialog({
  open,
  onOpenChange,
  kind,
  imageUrl,
  title,
  eyebrow,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: PortalPreviewKind;
  imageUrl: string;
  title?: string;
  eyebrow?: string;
  value: PortalImageAdjust | undefined;
  onChange: (next: PortalImageAdjust) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);

  const fit = value?.fit ?? DEFAULT_FIT[kind];
  const x = value?.x ?? 50;
  const y = value?.y ?? 50;
  const zoom = value?.zoom ?? 1;

  const emit = (patch: Partial<PortalImageAdjust>) => {
    const next: PortalImageAdjust = { ...value, ...patch };
    if (next.fit === DEFAULT_FIT[kind]) delete next.fit;
    if (next.x === 50) delete next.x;
    if (next.y === 50) delete next.y;
    if (next.zoom === 1) delete next.zoom;
    onChange(next);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !frame) return;
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // cover：拖动图片露出另一侧，位移与取值方向相反；contain：图片随拖动方向移动
    const sign = fit === "cover" ? -1 : 1;
    emit({
      x: Math.round(clamp(drag.x + (sign * (event.clientX - drag.startX) * 100) / rect.width, 0, 100) * 10) / 10,
      y: Math.round(clamp(drag.y + (sign * (event.clientY - drag.startY) * 100) / rect.height, 0, 100) * 10) / 10,
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const kindLabel = kind === "carousel" ? "轮播图" : kind === "application" ? "应用展示" : "能力模块";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>预览门户展示效果 · {kindLabel}</DialogTitle>
          <DialogDescription>
            与首页卡片同比例渲染。拖拽图片调整构图，放大可消除上下白边，移动可避开底部文字遮挡；调整随「保存」一同发布。
          </DialogDescription>
        </DialogHeader>

        <div
          ref={frameRef}
          className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-border"
          style={{ ...FRAME_STYLE[kind], cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full"
              style={frameImageStyle(kind, value)}
            />
          ) : null}
          <FrameOverlay kind={kind} title={title} eyebrow={eyebrow} />
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">填充方式</span>
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs ${fit === "contain" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                onClick={() => emit({ fit: "contain" })}
              >
                完整显示
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs ${fit === "cover" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                onClick={() => emit({ fit: "cover" })}
              >
                填满裁切
              </button>
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              位置 {x}% / {y}%
            </span>
          </div>
          <label className="flex items-center gap-3 text-xs text-muted-foreground">
            缩放
            <input
              type="range"
              min={100}
              max={250}
              step={1}
              value={Math.round(zoom * 100)}
              className="flex-1"
              onChange={(event) => emit({ zoom: Number(event.target.value) / 100 })}
            />
            <span className="w-10 text-right">{Math.round(zoom * 100)}%</span>
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onChange({})}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
