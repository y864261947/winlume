"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  LoaderCircle,
  MapPin,
  Pencil,
  Redo2,
  Send,
  Square,
  Undo2,
  X,
} from "lucide-react";
import {
  compositeImageAnnotation,
  drawImageAnnotationMarks,
  normalizeAnnotationPoint,
  type AnnotationMarkKind,
  type ImageAnnotationMark,
} from "@/lib/studio/image-annotations";

export type ImageAnnotationSubmit = {
  dataUrl: string;
  marks: ImageAnnotationMark[];
  request: string;
};

type Tool = AnnotationMarkKind;
type ImageRect = { left: number; top: number; width: number; height: number };

const TOOL_OPTIONS: Array<{
  value: Tool;
  label: string;
  Icon: typeof MapPin;
}> = [
  { value: "point", label: "图钉", Icon: MapPin },
  { value: "box", label: "框选", Icon: Square },
  { value: "pen", label: "画笔", Icon: Pencil },
];

function imageRect(image: HTMLImageElement | null): ImageRect | null {
  if (!image) return null;
  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function markId(): string {
  return `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function commentAnchor(
  rect: ImageRect,
  mark: ImageAnnotationMark,
): { left: number; top: number } | null {
  const point = mark.points.at(-1);
  if (!point) return null;

  const width = Math.min(384, window.innerWidth - 32);
  const height = 104;
  const x = rect.left + point.x * rect.width;
  const y = rect.top + point.y * rect.height;
  let left = x + 18;
  let top = y + 18;

  if (left + width > window.innerWidth - 16) left = x - width - 18;
  if (top + height > window.innerHeight - 16) top = y - height - 18;

  return {
    left: Math.max(16, Math.min(left, window.innerWidth - width - 16)),
    top: Math.max(16, Math.min(top, window.innerHeight - height - 16)),
  };
}

export default function ImageAnnotationOverlay(props: {
  image: HTMLImageElement | null;
  imageName: string;
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(input: ImageAnnotationSubmit): Promise<void>;
}): ReactNode {
  const { image, imageName, busy, error, onCancel, onSubmit } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const marksRef = useRef<ImageAnnotationMark[]>([]);
  const redoRef = useRef<ImageAnnotationMark[]>([]);
  const activeMarkRef = useRef<ImageAnnotationMark | null>(null);
  const rafRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  const [rect, setRect] = useState<ImageRect | null>(null);
  const [tool, setTool] = useState<Tool>("point");
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState({ marks: 0, redo: 0 });
  const [marksForUi, setMarksForUi] = useState<ImageAnnotationMark[]>([]);
  const [activeCommentMarkId, setActiveCommentMarkId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"enter" | "open" | "closing">("enter");
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The preview lives inside a glass/modal stacking context. Render the
  // drawing surface at the document root so it remains clickable above it.
  const portalTarget = typeof document === "undefined" ? null : document.body;

  const syncMarksForUi = useCallback(() => {
    setMarksForUi([...marksRef.current]);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const currentRect = imageRect(image);
    if (!canvas || !currentRect) return;

    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(currentRect.width * ratio));
    const height = Math.max(1, Math.round(currentRect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const marks = activeMarkRef.current
      ? [...marksRef.current, activeMarkRef.current]
      : marksRef.current;
    drawImageAnnotationMarks(ctx, marks, width, height);
  }, [image]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    const updateRect = () => {
      setRect(imageRect(image));
      scheduleDraw();
    };
    updateRect();
    if (!image) return;
    const observer = new ResizeObserver(updateRect);
    observer.observe(image);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [image, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [revision, scheduleDraw]);

  // The first rect update mounts the canvas after the observer callback returns.
  useEffect(() => {
    if (rect) scheduleDraw();
  }, [rect, scheduleDraw]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPhase("open"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const undo = useCallback(() => {
    const mark = marksRef.current.pop();
    if (!mark) return;
    redoRef.current.push(mark);
    setActiveCommentMarkId(marksRef.current.at(-1)?.id ?? null);
    syncMarksForUi();
    setHistory({ marks: marksRef.current.length, redo: redoRef.current.length });
    setRevision((value) => value + 1);
  }, [syncMarksForUi]);

  const redo = useCallback(() => {
    const mark = redoRef.current.pop();
    if (!mark) return;
    marksRef.current.push(mark);
    setActiveCommentMarkId(mark.id);
    syncMarksForUi();
    setHistory({ marks: marksRef.current.length, redo: redoRef.current.length });
    setRevision((value) => value + 1);
  }, [syncMarksForUi]);

  const send = useCallback(async () => {
    if (
      phase !== "open" ||
      busy ||
      submitting ||
      !marksRef.current.length ||
      !marksRef.current.every((mark) => mark.comment?.trim()) ||
      !image
    ) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const dataUrl = await compositeImageAnnotation(image, marksRef.current);
      await onSubmit({
        dataUrl,
        marks: marksRef.current,
        request: "请分别按照每个标记旁的说明修改图片。",
      });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "提交标注失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }, [busy, image, onSubmit, phase, submitting]);

  const requestClose = useCallback(() => {
    if (busy || submitting || phase === "closing") return;
    setPhase("closing");
    closeTimerRef.current = setTimeout(onCancel, 220);
  }, [busy, onCancel, phase, submitting]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, requestClose, undo]);

  const pointFromEvent = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const currentRect = imageRect(image);
      if (!currentRect) return null;
      return normalizeAnnotationPoint(
        { x: event.clientX, y: event.clientY },
        currentRect,
      );
    },
    [image],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (busy || submitting || phase !== "open") return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "point") {
      const mark = { id: markId(), kind: "point" as const, points: [point] };
      marksRef.current.push(mark);
      redoRef.current = [];
      setActiveCommentMarkId(mark.id);
      syncMarksForUi();
      setHistory({ marks: marksRef.current.length, redo: 0 });
      setRevision((value) => value + 1);
      return;
    }
    setActiveCommentMarkId(null);
    activeMarkRef.current = { id: markId(), kind: tool, points: [point] };
    scheduleDraw();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const activeMark = activeMarkRef.current;
    if (!activeMark) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (activeMark.kind === "box") activeMark.points[1] = point;
    else activeMark.points.push(point);
    scheduleDraw();
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const activeMark = activeMarkRef.current;
    if (!activeMark) return;
    const point = pointFromEvent(event);
    if (point && activeMark.kind === "box") activeMark.points[1] = point;
    if (activeMark.kind === "box" && activeMark.points.length < 2) {
      activeMark.points.push(activeMark.points[0]!);
    }
    activeMarkRef.current = null;
    marksRef.current.push(activeMark);
    redoRef.current = [];
    setActiveCommentMarkId(activeMark.id);
    syncMarksForUi();
    setHistory({ marks: marksRef.current.length, redo: 0 });
    setRevision((value) => value + 1);
  };

  const hasMarks = history.marks > 0;
  const activeTool = TOOL_OPTIONS.find((option) => option.value === tool)?.label ?? "图钉";
  const visibleError = submitError || error;
  const activeCommentMark = marksForUi.find(
    (mark) => mark.id === activeCommentMarkId,
  ) ?? null;
  const allMarksCommented = Boolean(
    marksForUi.length && marksForUi.every((mark) => mark.comment?.trim()),
  );
  const canSubmit = Boolean(
    phase === "open" && allMarksCommented && hasMarks && !busy && !submitting && image,
  );
  const anchoredComment =
    rect && activeCommentMark
      ? commentAnchor(rect, activeCommentMark)
      : null;
  const toolbarPosition = rect
    ? { left: rect.left + rect.width / 2, top: Math.max(8, rect.top - 48) }
    : undefined;

  const updateActiveComment = (comment: string) => {
    if (!activeCommentMarkId) return;
    marksRef.current = marksRef.current.map((mark) =>
      mark.id === activeCommentMarkId ? { ...mark, comment } : mark,
    );
    setMarksForUi((marks) =>
      marks.map((mark) =>
        mark.id === activeCommentMarkId ? { ...mark, comment } : mark,
      ),
    );
  };

  if (!rect || !portalTarget) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={`正在标注 ${imageName}`}
    >
      <canvas
        ref={canvasRef}
        className="image-annotation-stage pointer-events-auto fixed touch-none"
        data-state={phase}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
        aria-label={`图片标注画布，当前工具：${activeTool}`}
        aria-describedby="image-annotation-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      />
      <p id="image-annotation-help" className="sr-only">
        使用图钉、框选或画笔标出需要修改的图片区域，再填写修改要求。
      </p>

      <div
        className="image-annotation-toolbar pointer-events-auto fixed flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-lg border border-white/80 bg-white/95 p-1 shadow-lg backdrop-blur"
        data-state={phase}
        style={toolbarPosition}
      >
        <div className="flex items-center gap-0.5">
          {TOOL_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTool(value)}
              title={label}
              aria-pressed={tool === value}
              className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
                tool === value
                  ? "bg-[#0F172A] text-white"
                  : "text-[#615A73] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={undo}
          title="撤销 (Ctrl/Command + Z)"
          disabled={!hasMarks || busy || submitting}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#615A73] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:pointer-events-none disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
          <span className="sr-only">撤销</span>
        </button>
        <button
          type="button"
          onClick={redo}
          title="重做 (Ctrl/Command + Shift + Z)"
          disabled={!history.redo || busy || submitting}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#615A73] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:pointer-events-none disabled:opacity-40"
        >
          <Redo2 className="h-4 w-4" />
          <span className="sr-only">重做</span>
        </button>
        <button
          type="button"
          onClick={requestClose}
          title="取消标注 (Esc)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#615A73] transition-colors hover:bg-rose-50 hover:text-rose-700"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">取消标注</span>
        </button>
      </div>

      {anchoredComment ? (
        <div
          className="image-annotation-composer pointer-events-auto fixed flex w-[min(24rem,calc(100vw-2rem))] items-end gap-2 rounded-lg border border-white/80 bg-white/95 p-2 shadow-xl backdrop-blur"
          data-state={phase}
          style={anchoredComment}
        >
          <label className="sr-only" htmlFor="image-annotation-request">
            描述这个标记希望修改的内容
          </label>
          <textarea
            id="image-annotation-request"
            value={activeCommentMark?.comment ?? ""}
            rows={2}
            disabled={busy || submitting}
            onChange={(event) => updateActiveComment(event.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || composingRef.current) return;
              event.preventDefault();
              void send();
            }}
            placeholder="描述这个标记希望修改的效果…"
            className="min-h-12 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[#241E36] outline-none placeholder:text-[#8A8298] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSubmit}
            title="发送标注修改"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0F172A] text-white transition-colors hover:bg-[#1E293B] disabled:pointer-events-none disabled:opacity-40"
          >
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">发送标注修改</span>
          </button>
        </div>
      ) : null}
      {visibleError ? (
        <p
          role="alert"
          className="pointer-events-auto fixed w-[min(24rem,calc(100vw-2rem))] rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 shadow-sm"
          style={anchoredComment ? { left: anchoredComment.left, top: Math.max(8, anchoredComment.top - 42) } : undefined}
        >
          {visibleError}
        </p>
      ) : null}
    </div>,
    portalTarget,
  );
}
