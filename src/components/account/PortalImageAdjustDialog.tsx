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
import {
  PORTAL_FRAME_SPECS,
  compactPortalImageAdjust,
  portalImageStyle,
  resolvePortalImageAdjust,
  type PortalPreviewKind,
} from "@/lib/portal/image-framing";

export type { PortalPreviewKind };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Chrome drawn on top of the preview image, mirroring exactly what the homepage
 * paints over the artwork — so the admin sees which part of the image survives.
 */
function FrameOverlay({ kind, title, eyebrow }: { kind: PortalPreviewKind; title?: string; eyebrow?: string }) {
  if (kind === "carousel") {
    // The carousel card paints no scrim; only the nav buttons and dots float.
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

  if (kind === "capability") {
    // `.portal-home .portal-capability-hero.has-managed-image::after` — a white
    // left-to-right scrim, with the copy pinned in the left column (58%).
    return (
      <>
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(250,253,255,.98) 0%, rgba(248,252,255,.86) 48%, rgba(244,249,255,.1) 100%)",
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 left-0 grid w-[58%] content-center gap-1 px-4">
          {eyebrow ? (
            <em className="text-[10px] font-bold not-italic tracking-widest text-slate-500">{eyebrow}</em>
          ) : null}
          <strong className="truncate text-base text-[#20334d]">{title || "展示标题"}</strong>
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 w-[42%] border-l border-dashed border-sky-400/50" />
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-sky-500/85 px-1.5 py-0.5 text-[10px] font-medium text-white">
          仅此区域清晰可见
        </span>
      </>
    );
  }

  // Application cards: `globals.css` disables the ::after tint for these
  // (`display: none`), so the artwork shows full-bleed with no overlay text.
  return (
    <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
      整图展示 · 无文字遮罩
    </span>
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

  const spec = PORTAL_FRAME_SPECS[kind];
  const { fit, x, y, zoom } = resolvePortalImageAdjust(kind, value);

  const emit = (patch: Partial<PortalImageAdjust>) => {
    onChange(compactPortalImageAdjust(kind, { ...value, ...patch }));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>预览门户展示效果 · {spec.label}</DialogTitle>
          <DialogDescription>
            按首页真实比例 1:1 渲染。拖拽图片调整构图，缩放可放大主体；调整随「保存」一同发布。建议上传尺寸 {spec.recommended}。
          </DialogDescription>
        </DialogHeader>

        <div
          ref={frameRef}
          className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-border"
          style={{ aspectRatio: spec.aspectRatio, background: spec.background, cursor: "grab" }}
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
              style={portalImageStyle(kind, value) as CSSProperties}
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
          {fit === "contain" ? (
            <p className="text-xs text-amber-600">
              「完整显示」会在图片比例与卡片不一致时留出背景边；想铺满请改用「填满裁切」。
            </p>
          ) : null}
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
