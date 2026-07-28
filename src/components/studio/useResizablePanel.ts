"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type UseResizablePanelOptions = {
  /** localStorage key — NewMax persists panel widths this way */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** When true, drag left increases width (panel on the right). Default true. */
  invert?: boolean;
};

/**
 * Drag-to-resize side panel width with localStorage persistence.
 * Ported from NewMax rewrite-panel / split-pane pattern.
 */
export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  invert = true,
}: UseResizablePanelOptions) {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(defaultWidth);

  // Hydrate from storage after mount (avoid SSR mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const n = Number(raw);
      if (Number.isFinite(n)) {
        setWidth(Math.min(maxWidth, Math.max(minWidth, n)));
      }
    } catch {
      /* private mode */
    }
  }, [storageKey, minWidth, maxWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {
      /* ignore */
    }
  }, [storageKey, width]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next = invert
        ? startW.current - delta
        : startW.current + delta;
      setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
    },
    [invert, minWidth, maxWidth],
  );

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [width, onPointerMove, onPointerUp],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return { width, setWidth, onHandlePointerDown };
}
