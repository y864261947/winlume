"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { LiquidGlass } from "@ybouane/liquidglass";
import { isLiquidGlassEligible } from "./LiquidGlassSurface";

function canUseLiquidGlass() {
  const canvas = document.createElement("canvas");
  return isLiquidGlassEligible({
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    hasWebGl: Boolean(canvas.getContext("webgl")),
    reducedTransparency: window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    ).matches,
  });
}

export default function LiquidGlassNavIndicator({
  activeItem,
  children,
  onNavigate,
}: {
  activeItem: string;
  children: ReactNode;
  onNavigate?: (href: string) => void;
}) {
  const sceneRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const liquidGlassRef = useRef<LiquidGlass | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const [selectedItem, setSelectedItem] = useState(activeItem);

  useEffect(
    () => () => {
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
    },
    [],
  );

  const measureIndicator = useCallback(() => {
    const scene = sceneRef.current;
    const indicator = indicatorRef.current;
    if (!scene || !indicator) return;

    const activeLink = scene.querySelector<HTMLElement>(
      `[data-studio-nav-id="${selectedItem}"]`,
    );
    if (!activeLink) {
      indicator.style.opacity = "0";
      return;
    }

    const sceneRect = scene.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    indicator.style.height = `${linkRect.height}px`;
    indicator.style.opacity = "1";
    indicator.style.transform = `translate3d(${linkRect.left - sceneRect.left}px, ${linkRect.top - sceneRect.top}px, 0)`;
    indicator.style.width = `${linkRect.width}px`;
  }, [selectedItem]);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    measureIndicator();
    const observer = new ResizeObserver(measureIndicator);
    observer.observe(scene);
    scene
      .querySelectorAll<HTMLElement>("[data-studio-nav-id]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [measureIndicator]);

  useEffect(() => {
    liquidGlassRef.current?.markChanged();
  }, [selectedItem]);

  useEffect(() => {
    const scene = sceneRef.current;
    const indicator = indicatorRef.current;
    if (!scene || !indicator) return;
    if (!canUseLiquidGlass()) {
      return;
    }

    let cancelled = false;
    let instance: LiquidGlass | undefined;

    indicator.dataset.config = JSON.stringify({
      blurAmount: 0.18,
      brightness: 0,
      button: false,
      chromAberration: 0,
      cornerRadius: 11,
      distortion: 0,
      edgeHighlight: 0.3,
      floating: false,
      fresnel: 0.85,
      opacity: 0.96,
      refraction: 0.34,
      saturation: 0,
      shadowOffsetY: 1,
      shadowOpacity: 0.14,
      shadowSpread: 7,
      specular: 0.2,
      tintStrength: 0,
      zRadius: 10,
    });

    void import("@ybouane/liquidglass")
      .then(async ({ LiquidGlass: LiquidGlassRenderer }) => {
        if (cancelled) return;
        instance = await LiquidGlassRenderer.init({
          glassElements: [indicator],
          root: scene,
        });
        if (cancelled) {
          instance.destroy();
          return;
        }
        liquidGlassRef.current = instance;
        scene.dataset.liquidReady = "true";
      })
      .catch(() => {
        // The neutral CSS material remains available when WebGL is unavailable.
      });

    return () => {
      cancelled = true;
      delete scene.dataset.liquidReady;
      instance?.destroy();
      liquidGlassRef.current = null;
    };
  }, []);

  const handleNavigationIntent = useCallback(
    (event: Event) => {
      const href = (event as CustomEvent<string>).detail;
      if (!href || !onNavigate || href === activeItem) {
        return;
      }

      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
      setSelectedItem(href);
      navigationTimerRef.current = window.setTimeout(() => {
        navigationTimerRef.current = null;
        onNavigate(href);
      }, 240);
    },
    [activeItem, onNavigate],
  );

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    scene.addEventListener("studio-nav-intent", handleNavigationIntent);
    return () =>
      scene.removeEventListener("studio-nav-intent", handleNavigationIntent);
  }, [handleNavigationIntent]);

  return (
    <nav
      ref={sceneRef}
      className="studio-nav-liquid-scene relative isolate flex flex-col gap-0.5"
      data-active-nav={selectedItem}
      onPointerDownCapture={(event) => {
        const item = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-studio-nav-id]",
        );
        if (item?.dataset.studioNavId) setSelectedItem(item.dataset.studioNavId);
      }}
      onPointerCancel={() => setSelectedItem(activeItem)}
    >
      <div className="studio-nav-liquid-environment" aria-hidden />
      <div
        ref={indicatorRef}
        aria-hidden
        className="studio-nav-liquid-indicator"
      />
      {children}
    </nav>
  );
}
