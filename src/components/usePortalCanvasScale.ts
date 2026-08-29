"use client";

import { useEffect } from "react";

const DESKTOP_QUERY = "(min-width: 1181px)";

/**
 * Keeps the portal's desktop canvas at the same visual density as an 80%
 * browser zoom without changing hit areas of controls outside the canvas.
 * The negative flow compensation is measured because portal pages have
 * content-driven heights (catalog grids, account panels and docs pages).
 */
export function usePortalCanvasScale(frameSelector = ".portal-density-shell > .portal-frame") {
  useEffect(() => {
    const frames = Array.from(
      document.querySelectorAll<HTMLElement>(frameSelector),
    );
    if (!frames.length || typeof ResizeObserver === "undefined") return;

    const syncFrameFlow = (frame: HTMLElement) => {
      if (!window.matchMedia(DESKTOP_QUERY).matches) {
        frame.style.removeProperty("margin-bottom");
        return;
      }

      const layoutHeight = frame.offsetHeight;
      const renderedHeight = frame.getBoundingClientRect().height;
      frame.style.marginBottom = `${Math.min(0, renderedHeight - layoutHeight)}px`;
    };
    const handleResize = () => frames.forEach(syncFrameFlow);

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(handleResize);
    });
    frames.forEach((frame) => {
      observer.observe(frame);
      syncFrameFlow(frame);
    });
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      frames.forEach((frame) => frame.style.removeProperty("margin-bottom"));
    };
  }, [frameSelector]);
}
