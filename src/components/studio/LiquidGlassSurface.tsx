"use client";

import {
  cloneElement,
  useEffect,
  useRef,
  type ReactElement,
} from "react";
import type { LiquidGlass } from "@ybouane/liquidglass";

export type LiquidGlassCapability = {
  hasWebGl: boolean;
  coarsePointer: boolean;
  reducedTransparency: boolean;
};

export function isLiquidGlassEligible({
  hasWebGl,
  coarsePointer,
  reducedTransparency,
}: LiquidGlassCapability) {
  return hasWebGl && !coarsePointer && !reducedTransparency;
}

function getCapability(): LiquidGlassCapability {
  const canvas = document.createElement("canvas");
  return {
    hasWebGl: Boolean(canvas.getContext("webgl")),
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    reducedTransparency: window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    ).matches,
  };
}

/** Studio header / sidebar defaults */
export const HEADER_GLASS_DEFAULTS = {
  blurAmount: 0.2,
  refraction: 0.42,
  chromAberration: 0.018,
  edgeHighlight: 0.1,
  specular: 0.12,
  fresnel: 0.76,
  cornerRadius: 12,
  zRadius: 16,
  opacity: 0.9,
  saturation: 0.04,
  brightness: 0.02,
  shadowOpacity: 0.12,
  shadowSpread: 6,
  shadowOffsetY: 1,
} as const;

/**
 * Portal nav (scheme A): refract an opaque page-matched scene sibling.
 * Lower opacity = less milky; scene carries the clean color.
 */
export const PORTAL_NAV_GLASS_DEFAULTS = {
  blurAmount: 0.12,
  refraction: 0.62,
  chromAberration: 0.012,
  edgeHighlight: 0.22,
  specular: 0.24,
  fresnel: 0.9,
  cornerRadius: 16,
  zRadius: 14,
  opacity: 0.55,
  saturation: 0.1,
  brightness: 0.12,
  shadowOpacity: 0.05,
  shadowSpread: 4,
  shadowOffsetY: 1,
} as const;

export type LiquidGlassDefaults = {
  [K in keyof typeof HEADER_GLASS_DEFAULTS]?: number;
};

type LiquidGlassChildProps = {
  "data-liquid-glass"?: string;
};

export default function LiquidGlassSurface({
  children,
  defaults = HEADER_GLASS_DEFAULTS,
  className,
  sceneClassName = "studio-liquid-glass-scene",
  hideScene = false,
}: {
  children: ReactElement<LiquidGlassChildProps>;
  defaults?: LiquidGlassDefaults;
  className?: string;
  /** Class for the capture sibling painted *before* the glass in root. */
  sceneClassName?: string;
  hideScene?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const glass = root?.querySelector<HTMLElement>(":scope > [data-liquid-glass]");
    if (!root || !glass || !isLiquidGlassEligible(getCapability())) return;

    let cancelled = false;
    let instance: LiquidGlass | null = null;

    void import("@ybouane/liquidglass")
      .then(async ({ LiquidGlass }) => {
        const next = await LiquidGlass.init({
          root,
          glassElements: [glass],
          defaults: { ...HEADER_GLASS_DEFAULTS, ...defaults },
        });

        if (cancelled) {
          next.destroy();
          return;
        }

        instance = next;
        glass.dataset.liquidGlassReady = "true";
      })
      .catch(() => {
        // CSS frost remains if WebGL init fails.
      });

    return () => {
      cancelled = true;
      glass.removeAttribute("data-liquid-glass-ready");
      instance?.destroy();
    };
  }, [defaults]);

  return (
    <div
      ref={rootRef}
      className={["studio-liquid-glass-surface", className].filter(Boolean).join(" ")}
    >
      {hideScene ? null : (
        <div className={sceneClassName} aria-hidden />
      )}
      {cloneElement(children, { "data-liquid-glass": "true" })}
    </div>
  );
}
